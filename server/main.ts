// Creates a MapServer and listens for client connections
import MapServer from "./server.ts";

const port = 8080;
const server = new MapServer();

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
  if (req.headers.get("upgrade") === "websocket" ||
      url.pathname === "/start_web_socket") {
    return server.handleConnection(req);
  }

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
  } else {
    // The url pathname is requesting one of the files
    try {
      const filePath = `${Deno.cwd()}${url.pathname}`;
      return new Response(
        await Deno.readTextFile(filePath), {
          headers: {"content-type": contentType(filePath)}
      });
    } catch (e) {
      console.log(`Error for url ${url}`);
      return new Response("Not Found", {status: 404});
    }
  }
}

//console.log("Listening at http://localhost:" + port);
Deno.serve({port}, handler);

