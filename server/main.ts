// Supabase for image storage
import { createClient } from "https://esm.sh/@supabase/supabase-js";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Creates a MapServer and listens for client connections
import MapServer from "./server.ts";
const port = 8080;

// We use Deno KV to store existing room states and
// supabase channels to listen to broadcasts on how the
// room state has changed
//const kv = await Deno.openKv("http://localhost:7999"); // used for local testing
const kv = await Deno.openKv();
const channels = new Map<string, ReturnType<typeof supabase.channel>>();
const serverId = crypto.randomUUID();
const server = new MapServer(kv, serverId, supabase, channels);
console.log(`Started server with id ${serverId}`);

// Override console.error to print the serverId for logging purposes
const consoleError = console.error;
console.error = (...args: any[]) => {
  consoleError(`SERVER ${serverId} ERROR:\n`, ...args);
}

// load in and cache files
const files = new Map<string, Uint8Array | string>();
async function loadFiles(dir) {
  for await (const entry of Deno.readDir(dir)) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory) {
      await loadFiles(path);
    } else if (path.endsWith('.png') || path.endsWith('.svg')) {
      try {
        const fileData = await Deno.readFile(path);
        files.set(path, fileData);
      } catch (e) {
        console.log(`Error reading file ${path}`);
      }
    } else {
      try {
        const fileData = await Deno.readTextFile(path);
        files.set(path, fileData);
      } catch (e) {
        console.log(`Error reading file ${path}`);
      }
    }
  }
}
loadFiles(Deno.cwd())
  .then(() => console.log(`Loaded server files in server ${serverId}`))
  .catch((err) => console.error(`Failed to load server files in server ${serverId}`, err));

// Helper function to get Content-type header for a file
function contentType(filePath:string): string {
  if (filePath.endsWith('html')) {
    return "text/html";
  } else if (filePath.endsWith('js')) {
    return "application/javascript";
  } else if (filePath.endsWith('css')) {
    return "text/css";
  } else if (filePath.endsWith('png')) {
    return "image/png";
  } else if (filePath.endsWith('.svg')) {
    return "image/svg+xml";
  }
  // default: arbitrary binary data
  return "application/octet-stream"
}

// cleans up unused images from rooms in supabase image storage
// this is for when the room expires with images still intact, we handle
// deleted images in an active room as soon as they are deleted
async function clearExpiredRoomImages(roomId) {
  const urls = [];
  for await (const entry of kv.list({ prefix: ["server-image", roomId] })) {
    const id = entry.key[2];
    urls.push(`images/${id}-${roomId}.png`);
    await kv.delete(entry.key);
  }

  if (urls.length) {
    const { err } = await supabase.storage
      .from("images")
      .remove(urls);

    if (err) {
      console.error(`Issue clearing images for room ${roomId}:`, err);
    }
  }
}
async function clearExpiredImages() {
  const checkedRooms = new Set<string>();
  for await (const entry of kv.list({ prefix: ["server-image"] })) {
    const roomId = entry.key[1];
    if (checkedRooms.has(roomId)) {
      continue;
    }
    checkedRooms.add(roomId);

    const updatedItems = await kv.get(["updatedItems", roomId]);
    const createdItems = await kv.get(["createdItems", roomId]);
    if (!updatedItems.value && !createdItems.value) {
      await clearExpiredRoomImages(roomId);
    }
  }
}
setInterval(clearExpiredImages, 30000);

// Server pings the updatedItems and yjs for its rooms every 5s.
// If after 20s no server has pinged updatedItems for the roomId,
// the entry will expire
async function pingRoomServers(rooms) {
  for (const roomId of rooms) {
    try {
      const createdItems = await kv.get(["createdItems", roomId]);
      if (createdItems.value) {
        await kv.set(["createdItems", roomId], createdItems.value, {expireIn: 20000});
      }

      const updatedItems = await kv.get(["updatedItems", roomId]);
      if (updatedItems.value) {
        await kv.set(["updatedItems", roomId], updatedItems.value, {expireIn: 20000});
      }

      const yjs = await kv.get(["yjs", roomId]);
      if (yjs.value) {
        await kv.set(["yjs", roomId], yjs.value, {expireIn: 20000});
      }
    } catch (err) {
      console.error("pingRoomServers error:", err);
    }
  }
}
setInterval(() => {pingRoomServers(channels.keys())}, 5000);

// Update the items for a room for a server and set up a watcher
// for the room to listen for new broadcast messages
async function updateServer(roomId) {
  // This server already has the data for this room
  if (channels.has(roomId)) {
    return;
  }
  
  // setup channel subscription for broadcast updates
  const channel = supabase.channel(roomId, {
    config: {broadcast: {self: false}}
  });
  channel.on("broadcast", {event: "update-item"}, ({message}) => {
    server.broadcast(message, roomId, false);
  });
  channel.on("broadcast", {event: "create-item"}, ({message}) => {
    server.broadcast(message, roomId, false);
  });
  channel.on("broadcast", {event: "delete-item"}, ({message}) => {
    server.broadcast(message, roomId, false);
  });
  channel.on("broadcast", {event: "update-yjs"}, ({message}) => {
    const state = new Uint8Array(message);
    server.updateYDoc(state, roomId);
  });
  await channel.subscribe();

  channels.set(roomId, channel);
  console.log(`Server ${serverId} subscribed to room ${roomId}`);
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("room") || "default";

  // Websocket upgrade
  if (req.headers.get("upgrade") === "websocket") {
    await updateServer(roomId);
    return server.handleConnection(req);
  }

  // Handle image upload
  if (req.method === "POST" && url.pathname === "/upload") {
    const formData = await req.formData();
    const file = formData.get("image");
    const id = formData.get("element");
    const room = formData.get("roomId");

    // check for valid file
    if (!(file instanceof File)) {
      return new Response({status: 400});
    }
    
    // Upload to supabase storage
    const {data, error} = await supabase.storage.from("images")
      .upload(`images/${id}-${room}.png`, file, {upsert: true});
    if (error) {
      console.error("Image upload error:", error);
      return new Response({status: 500});
    }

    // Store URL
    const urlData = supabase.storage.from("images").getPublicUrl(`images/${id}-${room}.png`);
    const imageUrl = `${urlData.data.publicUrl}?t=${Date.now()}`; // add in date to avoid caching issues
    try {
      await kv.set(["server-image", room, id], imageUrl);
      console.log(`Image ${id}-${room}.png uploaded`);
    } catch (err) {
      console.error("Error uploading image to kv:", err);
    }
    return new Response({status: 200});
  }

  // Provide files (images, html, js, etc)
  if (url.pathname === "/") {
    const filePath = `${Deno.cwd()}/index.html`;
    const cachedFile = files.get(filePath);

    if (cachedFile) {
      return new Response(cachedFile, {
          headers: {"Content-type": "text/html"}
      });
    }
    const fileData = await Deno.readTextFile(`${Deno.cwd()}/index.html`);
    files.set(filePath, fileData);
    return new Response(fileData, {
        headers: {"Content-type": "text/html"}
    });
  } else if (url.pathname.startsWith("/images/") || url.pathname.startsWith("/favicon/")) {
    const filePath = `${Deno.cwd()}${url.pathname}`;
    const cachedFile = files.get(filePath);

    if (cachedFile) {
      return new Response(cachedFile, {
          headers: {
            "Content-type": contentType(filePath),
            "Cache-Control": "no-cache"
        }
      });
    }
    try {
      const fileData = await Deno.readFile(filePath);
      files.set(filePath, fileData);
      return new Response(fileData, {
        headers: {
          "Content-type": contentType(filePath),
          "Cache-Control": "no-cache"
        }
      });
    } catch (e) {
      console.log(`Error for url ${url}`);
      return new Response("Not Found", {status: 404});
    }
  } else if (url.pathname.startsWith("/server-image/")) {
    // Client is requesting image uploaded to server
    const id = url.pathname.split("/")[2];
    const imageUrl = await kv.get(["server-image", roomId, id]);
    
    // We set the cache-control header to ensure image paths are
    // not cached. This is important because the image under the
    // same path changes with each upload
    return new Response(null, {
      status: 302,
      headers: {
        "Location": imageUrl.value,
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  } else {
    // The url pathname is requesting one of the files
    const filePath = `${Deno.cwd()}${url.pathname}`;
    const cachedFile = files.get(filePath);

    if (cachedFile) {
      return new Response(cachedFile, {
          headers: {"Content-type": contentType(filePath)}
      });
    }
    try {
      const fileData = await Deno.readTextFile(filePath);
      files.set(filePath, fileData);
      return new Response(fileData, {
        headers: {"Content-type": contentType(filePath)}
      });
    } catch (e) {
      console.log(`Error for url ${url}`);
      return new Response("Not Found", {status: 404});
    }
  }
}

//console.log("Listening at http://localhost:" + port);
Deno.serve({port}, handler);