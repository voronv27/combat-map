// Main code to handle server behavior--deals with connection requests and
// broadcasts messages to connected websockets after receiving messages from
// a client (essentially "passing on" the message to other clients)

// Yjs to handle textbox updates
import * as Y from "https://esm.sh/yjs";

// TODO: eventually generate room codes
// either that or users can create their own + a password and
// it will let you know if the room already exists
// leaning towards option 2--but perhaps you have the
// option to generate a random room code as well

// TODO: TROUBLESHOOT THESE ISSUES
// improve load speed--try downloading some things locally instead of using the cdns
// get off of tailwind cdn, consider bundling yjs+Tiptap+tailwind+etc
// server should cache our files instead of using readTextFile every time

type AppEvent = { event: string; [key: string]: any };

export default class MapServer {
    // Connected websockets, keyed by room
    private connected = new Map<string, Set<WebSocket>>();

    // New websockets that need to be updated before they're considered "connected"
    private connecting = new Map<string, Set<WebSocket>>();

    // Keep track of items that are changed per room
    private updatedItems = new Map<string, Record<string, any>>();
    private createdItems = new Map<string, Record<string, Record<number, any>>>();

    // Keep track of textboxes per room
    private ydocs = new Map<string, Y.Doc>();

    // Keep track of how many clients are connected to a room
    private roomIds = {};

    // Information to broadcast cross-server
    private kv: Deno.Kv;
    private serverId: string;
    private supabase;
    private channels: Map<string, any>;
    constructor(kv: Deno.Kv, serverId: string, supabase: any, channels: Map<string, any>) {
        this.kv = kv;
        this.serverId = serverId;
        this.supabase = supabase;
        this.channels = channels;
    }

    public async handleConnection(request: Request): Response {
        const url = new URL(request.url);
        const roomId = url.searchParams.get("room") || "default";
        const {socket, response} = Deno.upgradeWebSocket(request);

        socket.addEventListener("open", async () => {
            var existingYdoc = false;
            if (!this.connected.has(roomId)) {
                this.connected.set(roomId, new Set());
            }
            if (!this.connecting.has(roomId)) {
                this.connecting.set(roomId, new Set());
            }
            if (!this.updatedItems.has(roomId)) {
                this.updatedItems.set(roomId, {});
            }
            if (!this.createdItems.has(roomId)) {
                this.createdItems.set(roomId, {});
            }
            if (!this.ydocs.has(roomId)) {
                this.ydocs.set(roomId, new Y.Doc());
            } else {
                existingYdoc = true;
            }
            if (!this.roomIds[roomId]) {
                this.roomIds[roomId] = 0;
            }

            // If we have existing connections, the new websocket needs to be
            // updated to match their shared state
            if ( this.connected.get(roomId).size ||
                 Object.keys(this.updatedItems.get(roomId)).length ||
                 existingYdoc ||
                 Object.keys(this.createdItems.get(roomId)).length ) {
                console.log("Client connecting");
                this.connecting.get(roomId).add(socket);
                this.updateNewClients(roomId);
            } else {
                console.log("Client connected");
                this.connected.get(roomId).add(socket);

                  // setup initial room data--must be done after this.connected has the roomId
                  // Fetch the items and textbox data for this room and update rooms server manages
                  try {
                    const items = await this.kv.get(["updatedItems", roomId]);
                    const createdItems = await this.kv.get(["createdItems", roomId]);
                    const updates = await this.kv.get(["yjs", roomId]);
                    if (updates.value || items.value || createdItems.value) {
                      console.log(`Add existing room data for ${roomId} to server ${this.serverId}`);

                      // make sure we create items before updating their values
                      if (createdItems.value) {
                        this.createItems(createdItems.value, roomId);
                      }
                      if (updates.value) {
                        this.updateYDoc(updates.value, roomId);
                      }
                      if (items.value) {
                        this.updateItems(items.value, roomId);
                      }
                    }
                  } catch (err) {
                    console.error("updateServer error:", err);
                  }
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
                this.createdItems.delete(roomId);
                this.ydocs.delete(roomId);
                delete this.roomIds[roomId];
                const channel = this.channels.get(roomId);
                if (channel) {
                    await channel.unsubscribe();
                    this.channels.delete(roomId);
                }
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
            case "create-item":
                this.broadcast({
                    event: "create-item",
                    location: data.location,
                    values: data.values
                }, roomId);
                if (!(data.location in this.createdItems.get(roomId))) {
                    this.createdItems.get(roomId)[data.location] = {};
                }
                this.createdItems.get(roomId)[data.location][data.values.counter] = data.values;
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
        } else if (message.event === "create-item") {
            if (!(message.location in this.createdItems.get(roomId))) {
                this.createdItems.get(roomId)[message.location] = {};
            }
            this.createdItems.get(roomId)[message.location][message.values.counter] = message.values;
        }

        // if we should broadcast this message to other servers, do so
        if (broadcastToServers) {
            try {
                if (message.event === "update-item") {
                    await this.kv.set(["updatedItems", roomId], this.updatedItems.get(roomId), {expireIn: 20000});
                } else if (message.event === "create-item") {
                    await this.kv.set(["createdItems", roomId], this.createdItems.get(roomId), {expireIn: 20000});
                }
            } catch (err) {
                console.error("Error in updating server's updatedItems or createdItems:", err);
            }
            const channel = this.channels.get(roomId);
            if (channel && channel.state == "joined") {
                if (message.event === "update-item") {
                    await channel.send({
                        type: "broadcast",
                        event: "update-item",
                        message: message
                    });
                } else if (message.event === "create-item") {
                    await channel.send({
                        type: "broadcast",
                        event: "create-item",
                        message: message
                    });
                }
            }
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
            user.send(message);
        }

        // update server ydoc
        const update = new Uint8Array(message);
        Y.applyUpdate(this.ydocs.get(roomId), update);
        
        // if we should broadcast this message to other servers, do so
        if (broadcastToServers) {
            const ydoc = this.ydocs.get(roomId);
            const state = Y.encodeStateAsUpdate(ydoc);
            try {
                await this.kv.set(["yjs", roomId], state, {expireIn: 20000});
            } catch (err) {
                console.error("Error in updating server binary data:", error);
            }
            const channel = this.channels.get(roomId);
            if (channel && channel.state == "joined") {
                await channel.send({
                    type: "broadcast",
                    event: "update-yjs",
                    message: Array.from(new Uint8Array(state)) // convert for Supabase
                });
            }
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

    // Add new items (for new server)
    public createItems(items: any, roomId: string) {
        this.createdItems.set(roomId, items);
        this.broadcast({
            event: "create-all",
            data: this.createdItems.get(roomId),
        }, roomId, false);
    }

    // Update yjs ydoc (for new server)
    public updateYDoc(updates: Uint8Array, roomId: string) {
        this.ydocs.set(roomId, new Y.Doc());
        Y.applyUpdate(this.ydocs.get(roomId), updates);

        this.broadcastBinary(updates, roomId, false);
    }

    // Send updatedItems data to connecting sockets
    private updateNewClients(roomId: string) {
        var connectingSockets = this.connecting.get(roomId);
        for (let socket of connectingSockets) {
            // send createdItems
            socket.send(JSON.stringify({
                event: "create-all",
                data: this.createdItems.get(roomId)
            }));
            
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