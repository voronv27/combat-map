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
await kv.set(["servers", serverId], {heartbeat: Date.now()}, {expireIn: 20000});
console.log(`Started server with id ${serverId}`);

// Server pings its id in KV every 5s. If after 20s it hasn't done so, it will expire
setInterval(() => {
  kv.set(["servers", serverId], {heartbeat: Date.now()}, {expireIn: 20000});
}, 5000);

// Get the list of items to be updated from Deno KV and update the server When we swap to server rooms, 
// this function can be modified to get the specific room id
async function updateServer() {
  const items = await kv.get(["updatedItems"]);
  if (items.value) {
    server.updateItems(items.value);
  }
}
updateServer();

// Helper function to get Content-type header for a file
function contentType(filePath:string): string {
  if (filePath.endsWith('html')) {
    return "text/html";
  } else if (filePath.endsWith('js')) {
    return "application/javascript";
  } else if (filePath.endsWith('css')) {
    return "text/css";
  }
  // default: arbitrary binary data
  return "application/octet-stream"
}

// Listen for broadcast messages from other servers and
// pass them along to this server's connected clients
async function serverBroadcast() {
  const watcher = kv.watch([["broadcast"]]);
  for await (const [entry] of watcher) {
    const value = entry.value;
    if (!value || value.id === serverId) {
      continue;
    }
    server.broadcast(value.msg, false);
  }
}

async function handler(req: Request): Promise<Reponse> {
  const url = new URL(req.url);

  // Websocket upgrade
  if (req.headers.get("upgrade") === "websocket") {
    return server.handleConnection(req);
  }

  // Handle image upload
  if (req.method === "POST" && url.pathname === "/upload") {
    const formData = await req.formData();
    const file = formData.get("image");
    const id = formData.get("element");

    // check for valid file
    if (!(file instanceof File)) {
      return new Response({status: 400});
    }
    
    // Upload to supabase storage
    const {data, error} = await supabase.storage.from("images")
      .upload(`images/${id}.png`, file, {upsert: true});
    if (error) {
      console.error("Image upload error:", error);
      return new Response({status: 500});
    }

    // Store URL
    const urlData = supabase.storage.from("images").getPublicUrl(`images/${id}.png`);
    const imageUrl = `${urlData.data.publicUrl}?t=${Date.now()}`; // add in date to avoid caching issues
    await kv.set(["server-image", id], imageUrl);
    console.log("uploaded");
    return new Response({status: 200});
  }

  // Provide files (images, html, js, etc)
  if (url.pathname === "/") {
    return new Response(
      await Deno.readTextFile(`${Deno.cwd()}/index.html`), {
        headers: {"Content-type": "text/html"}
    });
  } else if (url.pathname === "/images/sample_map.png") {
    return new Response(
      await Deno.readFile(`${Deno.cwd()}/images/sample_map.png`), {
        headers: {"Content-type": "image/png"}
    });
  } else if (url.pathname.startsWith("/server-image/")) {
    // Client is requesting image uploaded to server
    const id = url.pathname.split("/")[2];
    const imageUrl = await kv.get(["server-image", id]);
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
serverBroadcast();