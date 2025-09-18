// Creates a MapServer and listens for client connections
import { Application, Context, Router } from "@oak/oak";
import MapServer from "./server.ts";

const app = new Application();
const port = 8080;
const router = new Router();
const server = new MapServer();

router.get("/start_web_socket", (ctx: Context) => server.handleConnection(ctx));

app.use(router.routes());
app.use(router.allowedMethods());
app.use(async (context) => {
  await context.send({
    root: `${Deno.cwd()}`,
    index: "index.html",
  });
});

//console.log("Listening at http://localhost:" + port);
await app.listen({ port });

