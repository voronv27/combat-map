// Main code to handle server behavior--deals with connection requests and
// broadcasts messages to connected websockets after receiving messages from
// a client (essentially "passing on" the message to other clients)

type AppEvent = { event: string; [key: string]: any };

export default class MapServer {
    // Connected websockets, keyed by room
    private connected = new Map<string, Set<WebSocket>>();

    // New websockets that need to be updated before they're considered "connected"
    private connecting = new Map<string, Set<WebSocket>>();

    // Keep track of items that are changed per room
    private updatedItems = new Map<string, Record<string, any>>();

    // Keep track of how many clients are connected to a room
    private roomIds = {};

    // Information to broadcast cross-server
    private kv: Deno.Kv;
    private serverId: string;
    constructor(kv: Deno.Kv, serverId: string) {
        this.kv = kv;
        this.serverId = serverId;
    }

    public async handleConnection(request: Request): Response {
        const url = new URL(request.url);
        const roomId = url.searchParams.get("room") || "default";
        const {socket, response} = Deno.upgradeWebSocket(request);

        socket.addEventListener("open", () => {
            if (!this.connected.has(roomId)) {
                this.connected.set(roomId, new Set());
            }
            if (!this.connecting.has(roomId)) {
                this.connecting.set(roomId, new Set());
            }
            if (!this.updatedItems.has(roomId)) {
                this.updatedItems.set(roomId, {});
            }
            if (!this.roomIds[roomId]) {
                this.roomIds[roomId] = 0;
            }

            // If we have existing connections, the new websocket needs to be
            // updated to match their shared state
            if (this.connected.get(roomId).size || Object.keys(this.updatedItems.get(roomId)).length) {
                console.log("Client connecting");
                this.connecting.get(roomId).add(socket);
                this.updateNewClients(roomId);
            } else {
                console.log("Client connected");
                this.connected.get(roomId).add(socket);
            }
            this.roomIds[roomId] += 1;
        });

        // Remove from connected Websockets
        socket.addEventListener("close", async () => {
            this.connecting.get(roomId)?.delete(socket);
            this.connected.get(roomId)?.delete(socket);
            console.log("Client disconnected");
            
            // Get rid of roomId if no more clients are connected to the room
            this.roomIds[roomId] -= 1;
            if (this.roomIds[roomId] === 0) {
                this.connecting.delete(roomId);
                this.connected.delete(roomId);
                this.updatedItems.delete(roomId);
                delete this.roomIds[roomId];
                await this.kv.set(["broadcast", roomId], {"delete": this.serverId});
            }
        });

        // After recieving a client message server will send out its own message
        socket.addEventListener("message", (m) => {
            this.send(m, roomId);
        });

        return response;
    }

    // Handle various events and send messages to the clients
    private send(message: any, roomId: string) {
        const data = JSON.parse(message.data);
        switch (data.event) {
            case "update-item":
                this.broadcast({
                    event: "update-item",
                    item: data.item,
                    values: data.values
                }, roomId);
                this.updatedItems.get(roomId)[data.item] = data.values;
                break;
        }
    }

    // Helper function to broadcast a message to all connected clients
    public async broadcast(message: AppEvent, roomId: string, broadcastToServers: boolean = true) {
        if (!this.connected.has(roomId)) {
            console.log("Room id not found", roomId)
            return;
        }
        const messageString = JSON.stringify(message);
        for (let user of this.connected.get(roomId)) {
            user.send(messageString);
        }
        if (message.event === "update-item") {
            this.updatedItems.get(roomId)[message.item] = message.values;
        }

        // if we should broadcast this message to other servers, do so
        if (broadcastToServers) {
            await this.kv.set(["updatedItems", roomId], this.updatedItems.get(roomId), {expireIn: 20000});
            await this.kv.set(["broadcast", roomId], {
                id: this.serverId,
                msg: message
            });
        }
    }

    // Update room items (for new server)
    public updateItems(items: any, roomId: string) {
        this.updatedItems.set(roomId, items);
        this.broadcast({
            event: "update-all",
            data: this.updatedItems.get(roomId),
        }, roomId, false);
    }

    // Send updatedItems data to connecting sockets
    private updateNewClients(roomId: string) {
        var connectingSockets = this.connecting.get(roomId);
        for (let socket of connectingSockets) {
            socket.send(JSON.stringify({
                event: "update-all",
                data: this.updatedItems.get(roomId),
            }));
            this.connecting.get(roomId).delete(socket);
            this.connected.get(roomId).add(socket);
            console.log("Client connected");
        }
    }
}