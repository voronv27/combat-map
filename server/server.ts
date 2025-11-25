// Main code to handle server behavior--deals with connection requests and
// broadcasts messages to connected websockets after receiving messages from
// a client (essentially "passing on" the message to other clients)

type AppEvent = { event: string; [key: string]: any };

export default class MapServer {
    // Connected websockets
    private connected = new Set<WebSocket>();

    // New websockets that need to be updated before they're considered "connected"
    private connecting = new Set<WebSocket>();

    // information to broadcast cross-server
    private kv: Deno.Kv;
    private serverId: string;
    constructor(kv: Deno.Kv, serverId: string) {
        this.kv = kv;
        this.serverId = serverId;
    }

    public async handleConnection(request: Request): Response {
        const {socket, response} = Deno.upgradeWebSocket(request);

        socket.addEventListener("open", () => {
            // If we have existing connections, the new websocket needs to be
            // updated to match their shared state
            if (this.connected.size) {
                console.log("Client connecting");
                this.connecting.add(socket);
                this.updateNewClients();
            } else {
                console.log("Client connected");
                this.connected.add(socket);
            }
        });

        // Remove from connected Websockets
        socket.addEventListener("close", () => {
            this.connecting.delete(socket);
            this.connected.delete(socket);
            console.log("Client disconnected");
        });

        // After recieving a client message server will send out its own message
        socket.addEventListener("message", (m) => {
            this.send(m);
        });

        return response;
    }

    // Handle various events and send messages to the clients
    private send(message: any) {
        const data = JSON.parse(message.data);
        switch (data.event) {
            case "update-item":
                this.broadcast({
                    event: "update-item",
                    item: data.item,
                    values: data.values
                });
                break;

            // upon recieving a response to a "request-all",
            // send the desired socket a message to update all
            case "request-all":
                var connectingSockets = this.connecting;
                for (let socket of connectingSockets) {
                    socket.send(JSON.stringify({
                        event: "update-all",
                        data: data.data,
                    }));
                    this.connecting.delete(socket);
                    this.connected.add(socket);
                    console.log("Client connected");
                }
                break;
        }
    }

    // Helper function to broadcast a message to all connected clients
    async broadcast(message: AppEvent, serverBroadcast: bool = true) {
        const messageString = JSON.stringify(message);
        for (let user of this.connected) {
            user.send(messageString);
        }

        // if we should broadcast this message to other servers, do so
        // TODO: add a timeout
        if (serverBroadcast) {
            await this.kv.set(["broadcast", Date.now().toString()], {
                id: this.serverId,
                msg: message
            });
        }
    }

    // Get shared website state from an already-connected connected client
    // which will allow us to update our connecting clients
    private updateNewClients() {
        for (let user of this.connected) {
            // requests status of all interactable objects
            const message = {event: "request-all"};
            user.send(JSON.stringify(message));

            // We only need one client to update our socket
            break;
        }
    }
}