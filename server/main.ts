// Supabase for image storage
import { createClient } from "https://esm.sh/@supabase/supabase-js";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Creates a MapServer and listens for client connections
import MapServer from "./server.ts";
const port = 8080;

// We need to use Deno KV to ensure we are broadcasting to websockets
// across servers (Deno Deploy will run this as multiple servers)
const kv = await Deno.openKv();
const serverId = crypto.randomUUID();
const server = new MapServer(kv, serverId);
console.log(`Started server with id ${serverId}`);

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
  }
  // default: arbitrary binary data
  return "application/octet-stream"
}

const roomIds = new Set<string>();

// Server pings the updatedItems for its rooms every 5s.
// If after 20s no server has pinged updatedItems for the roomId,
// the entry will expire
async function pingRoomServers(rooms) {
  for (const roomId of rooms) {
    const updatedItems = await kv.get(["updatedItems", roomId]);
    await kv.set(["updatedItems", roomId], updatedItems.value, {expireIn: 20000});
  }
}
setInterval(() => {pingRoomServers(roomIds)}, 5000);

// Listen for broadcast messages from other servers and
// pass them along to this server's connected clients
async function serverBroadcast(roomId) {
  const watcher = kv.watch([["broadcast", roomId]]);
  for await (const [entry] of watcher) {
    const value = entry.value;

    if (!value || value.id === serverId) {
      // Invalid message or message from the server
      continue;
    } else if (value.delete === serverId) {
      // Remove this room from rooms the server is managing
      roomIds.delete(roomId);
      return; // stop watching
    } else if (value.delete) {
      continue;
    }

    // Pass on other server's broadcast msg
    server.broadcast(value.msg, roomId, false);
  }
}

// Update the items for a room for a server and set up a watcher
// for the room to listen for new broadcast messages
async function updateServer(roomId) {
  // This server already has the data for this room
  if (roomIds.has(roomId)) {
    return;
  }

  // Fetch the items for this room and update rooms server manages
  const items = await kv.get(["updatedItems", roomId]);
  if (items.value) {
    console.log(`Add room ${roomId} to server ${serverId}`);
    server.updateItems(items.value, roomId);
  } else {
    console.log(`Create new room ${roomId} in server ${serverId}`);
  }

  // Set up kv watch on the room
  serverBroadcast(roomId);
  roomIds.add(roomId);
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
    await kv.set(["server-image", room, id], imageUrl);
    console.log(`Image ${id}-${room}.png uploaded`);
    return new Response({status: 200});
  }

  // Provide files (images, html, js, etc)
  if (url.pathname === "/") {
    return new Response(
      await Deno.readTextFile(`${Deno.cwd()}/index.html`), {
        headers: {"Content-type": "text/html"}
    });
  } else if (url.pathname.startsWith("/images/")) {
    const filePath = `${Deno.cwd()}${url.pathname}`;
    try {
      const fileData = await Deno.readFile(filePath);
      return new Response(fileData, {
        headers: {"Content-type": contentType(filePath)}
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
    try {
      const fileData = await Deno.readTextFile(filePath);
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