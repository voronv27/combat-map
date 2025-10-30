// Creates a MapServer and listens for client connections
import MapServer from "./server.ts";

const port = 8080;
const server = new MapServer();

// store uploaded images (map background, token images (TODO), etc)
const images = new Map<string, Uint8Array>();

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
    // store file in our images Map
    const bytes = new Uint8Array(await file.arrayBuffer());
    images.set(id, bytes);
    console.log(`Uploaded image for element ${id}`);
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
    const data = images.get(id);

    // We set the cache-control header to ensure image paths are
    // not cached. This is important because the image under the
    // same path changes with each upload
    return new Response(data, {
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

