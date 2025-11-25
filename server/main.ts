// Creates a MapServer and listens for client connections
import MapServer from "./server.ts";

const port = 8080;

// We need to use Deno KV to ensure we are broadcasting to websockets
// across servers (Deno Deploy will run this as multiple servers)
const kv = await Deno.openKv();
const serverId = crypto.randomUUID();
const server = new MapServer(kv, serverId);
await kv.set(["servers", serverId], {
  startedAt: Date.now()
});
console.log(`Started server with id ${serverId}`);

// Server pings its id in KV. TODO: when the heartbeat isn't updated over
// a timeframe (TBD), delete (use expireIn option)
setInterval(() => {
  kv.set(["servers", serverId], { heartbeat: Date.now() });
}, 10000);

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
  for await (const entry of watcher) {
    const { value } = entry;
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
    // store file in KV under the "server-image" key
    // Deno KV only goes up to 64k bytes so chunk image as needed
    const bytes = new Uint8Array(await file.arrayBuffer());
    var chunk = 0;
    for (let i = 0; i < bytes.length; i += 64000) {
      await kv.set(["server-image", id, chunk++], bytes.slice(i, i+64000));
    }
    await kv.set(["server-image", id, "size"], chunk);
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
    const size = await kv.get(["server-image", id, "size"]);
    
    var bytes = new Uint8Array(size.value * 64000);
    var offset = 0;
    for (let i = 0; i < size.value; i++) {
      const data = await kv.get(["server-image", id, i]);
      bytes.set(data.value, offset);
      offset += data.value.length;
    }

    // We set the cache-control header to ensure image paths are
    // not cached. This is important because the image under the
    // same path changes with each upload
    //return new Response(data.value, {
    return new Response(bytes, {
      headers: {
        "Content-type": "image/png",
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