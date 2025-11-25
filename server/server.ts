// Main code to handle server behavior--deals with connection requests and
// broadcasts messages to connected websockets after receiving messages from
// a client (essentially "passing on" the message to other clients)

type AppEvent = { event: string; [key: string]: any };

export default class MapServer {
    // Connected websockets
    private connected = new Set<WebSocket>();

    // New websockets that need to be updated before they're considered "connected"
    private connecting = new Set<WebSocket>();

    private updatedItems = {};

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
                this.updatedItems[data.item] = data.values;
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
            await this.kv.set(["broadcast"], {
                id: this.serverId,
                msg: message
            });
        }
    }

    // Broadcast this server's updatedItems for newly-joining servers
    public async broadcastUpdatedItems() {
        await this.kv.set(["broadcast"], {
            id: this.serverId,
            msg: "new-server",
            items: this.updatedItems
        });
    }

    public updateItems(items: any) {
        this.updatedItems = items;
    }

    // Send updatedItems data to connecting sockets
    private updateNewClients() {
        var connectingSockets = this.connecting;
        for (let socket of connectingSockets) {
            socket.send(JSON.stringify({
                event: "update-all",
                data: this.updatedItems,
            }));
            this.connecting.delete(socket);
            this.connected.add(socket);
            console.log("Client connected");
        }        
    }
}