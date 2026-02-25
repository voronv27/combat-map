// Main code to handle server behavior--deals with connection requests and
// broadcasts messages to connected websockets after receiving messages from
// a client (essentially "passing on" the message to other clients)

// Yjs to handle textbox updates
import * as Y from "https://esm.sh/yjs";

// TODO: TROUBLESHOOT THESE ISSUES
// cross-server updates are very bad lol
// it did actually communicate something after i had a second client join on phone
// type on first phone tab --> next to nothing
// join on second phone tab --> everything synced up :)

// preliminary investigation results: img upload is shared cross server
// text is weird--phone sends to computer, but computer doesn't send updates to phone
// shares cross-server one-way, for some reason
// when I joined the server on my phone first and then the computer, it was the opposite issue
// so whichever server creates the room can't broadcast to other servers... for unknown reasons

// improve load speed--try downloading some things locally instead of using the cdns
type AppEvent = { event: string; [key: string]: any };

export default class MapServer {
    // Connected websockets, keyed by room
    private connected = new Map<string, Set<WebSocket>>();

    // New websockets that need to be updated before they're considered "connected"
    private connecting = new Map<string, Set<WebSocket>>();

    // Keep track of items that are changed per room
    private updatedItems = new Map<string, Record<string, any>>();

    // Keep track of textboxes per room
    private ydocs = new Map<string, Y.Doc>();

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
            if (!this.ydocs.has(roomId)) {
                this.ydocs.set(roomId, new Y.Doc());
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
                this.ydocs.delete(roomId);
                delete this.roomIds[roomId];
                await this.kv.set(["broadcast", roomId], {"delete": this.serverId});
                await this.kv.set(["broadcastBinary", roomId], {"delete": this.serverId});
            }
        });

        // After recieving a client message server will send out its own message
        socket.addEventListener("message", (m) => {
            // yjs updates are binary, handle differently
            if (m.data instanceof ArrayBuffer) {
                this.broadcastBinary(m.data, roomId);
                return;
            }
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

    // Helper function to broadcast a JSON message to all connected clients
    public async broadcast(message: AppEvent, roomId: string,
                           broadcastToServers: boolean = true) {
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

    // Helper function to broadcast a binary message to all connected clients
    public async broadcastBinary(message: ArrayBuffer, roomId: string,
                                 broadcastToServers: boolean = true) {
        if (!this.connected.has(roomId)) {
            console.log("Room id not found", roomId)
            return;
        }
        for (let user of this.connected.get(roomId)) {
            console.log("sending ydoc update to user");
            user.send(message);
        }

        // update server ydoc
        const update = new Uint8Array(message);
        Y.applyUpdate(this.ydocs.get(roomId), update);
        
        // if we should broadcast this message to other servers, do so
        if (broadcastToServers) {
            const ydoc = this.ydocs.get(roomId);
            const state = Y.encodeStateAsUpdate(ydoc);
            await this.kv.set(["yjs", roomId], state, {expireIn: 20000});
            await this.kv.set(["broadcastBinary", roomId], {
                id: this.serverId,
                msg: update
            });
            console.log("broadcasting to other servers...");
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

    // Update yjs ydoc (for new server)
    public updateYDoc(updates: Uint8Array, roomId: string) {
        console.log("updating ydoc")
        this.ydocs.set(roomId, new Y.Doc());
        Y.applyUpdate(this.ydocs.get(roomId), updates);

        this.broadcastBinary(updates, roomId, false);
    }

    // Send updatedItems data to connecting sockets
    private updateNewClients(roomId: string) {
        var connectingSockets = this.connecting.get(roomId);
        for (let socket of connectingSockets) {
            // send updatedItems
            socket.send(JSON.stringify({
                event: "update-all",
                data: this.updatedItems.get(roomId),
            }));

            // send all textbox updates
            const ydoc = this.ydocs.get(roomId);
            if (ydoc) {
                const state = Y.encodeStateAsUpdate(ydoc);
                socket.send(state);
            }
            this.connecting.get(roomId).delete(socket);
            this.connected.get(roomId).add(socket);
            console.log("Client connected");
        }
    }
}