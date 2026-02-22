// This file contains all code related to interacting with the server, whether
// sending the server messages when the client modifies something on the site,
// or getting messages from the server from another client's changes

// we use Yjs + Tiptap for textboxes to have group text editing
import * as Y from 'https://esm.sh/yjs'
import { Editor } from 'https://esm.sh/@tiptap/core'
import StarterKit from 'https://esm.sh/@tiptap/starter-kit'
import { Collaboration } from 'https://esm.sh/@tiptap/extension-collaboration'
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder'

// store updated items as { "itemId": { "changeablePropertyName": value }}
var updatedItems = {};
var socket = null;
var ydoc = null;
var textboxBindings = {};

function bindTextboxToYjs(id) {
    const input = document.getElementById(id);
    const placeholder = input.dataset.placeholder;
    
    const editor = new Editor({
        element: input,
        extensions: [
            StarterKit.configure({
                history: false, // Collaboration has its own, disable to avoid warnings
            }),
            Collaboration.configure({
                document: ydoc,
                field: id
            }),
            Placeholder.configure({
                placeholder: placeholder
            })
        ],
        content: ""
    });

    textboxBindings[id] = {
        destroy() {
            editor.destroy();
        }
    };
}

// creates a new child in the container and adds a
// listener for it
var idCounters = {"initiative": 0, "conditions": 0};
export function addNewTextbox(tabName) {
    // make a copy of the desired textbox
    const tab = document.getElementById(tabName);
    const exampleTextbox = tab.firstElementChild;
    const newTextbox = exampleTextbox.cloneNode(true);

    // add new ids and clear any text for the name and
    // box parts of the textbox
    const nameText = newTextbox.querySelector('.name');
    const boxText = newTextbox.querySelector('.box');

    nameText.id = `${tabName}Name-${idCounters[tabName]}`;
    nameText.innerHTML = "";

    boxText.id = `${tabName}Box-${idCounters[tabName]}`;
    boxText.innerHTML = "";

    idCounters[tabName] += 1;

    // TODO: send message over the socket that this
    // item should be created

    // append item at bottom just above the button
    const btn = tab.lastElementChild;
    tab.insertBefore(newTextbox, btn);

    // add new items to our ydoc
    bindTextboxToYjs(nameText.id);
    bindTextboxToYjs(boxText.id);

    // add click forwarding (click parent --> focus child)
    newTextbox.querySelectorAll('.wrapper').forEach(w => {
        const inner = w.querySelector('[contenteditable]');
        w.onmousedown = (e) => {
            if (e.target === w) {
                e.preventDefault(); // prevent unfocus
                inner.focus();
            }
        }
    });
}
window.addNewTextbox = addNewTextbox;

// remove textbox from the container unless its the last one,
// in which case just clear the text
export function removeTextbox(textbox, tabName) {
    // TODO: send message over the socket that this
    // item should be removed

    const tab = document.getElementById(tabName);
    const children = tab.children;
    
    // check if we only have 1 item + the add button
    const nameText = textbox.querySelector('.name');
    const boxText = textbox.querySelector('.box');

    if (children.length > 2) {
        textbox.remove();

        // remove yjs bindings
        if (textboxBindings[nameText.id]) {
            textboxBindings[nameText.id].destroy();
            delete textboxBindings[nameText.id];
        }
        if (textboxBindings[boxText.id]) {
            textboxBindings[boxText.id].destroy();
            delete textboxBindings[boxText.id];
        }
    } else {
        // don't delete, just clear
        const nameFrag = ydoc.getXmlFragment(nameText.id);
        ydoc.transact(() => {nameFrag.delete(0, nameFrag.length)});

        const boxFrag = ydoc.getXmlFragment(boxText.id);
        ydoc.transact(() => {boxFrag.delete(0, boxFrag.length)});
    }
}
window.removeTextbox = removeTextbox;

async function startWebSocket(roomId) {
    // Connect to server
    var url = new URL("./start_web_socket?room=" + roomId,
        location.href);
    url.protocol = url.protocol.replace("http", "ws");
    socket = new WebSocket(url);
    
    // yjs for group editing on textboxes
    socket.binaryType = "arraybuffer";
    ydoc = new Y.Doc();
    ydoc.on("update", (update) => {
        socket.send(update);
    });
    
    document.getElementById("roomCode").textContent = roomId;

    // Listen for server messages and update page elements
    socket.onmessage = (event) => {
        // check if binary Yjs update
        if (event.data instanceof ArrayBuffer) {
            const update = new Uint8Array(event.data);
            Y.applyUpdate(ydoc, update);
            return;
        }
        const data = JSON.parse(event.data);
        switch (data.event) {
            case "update-all":
                // TODO: once we allow users to add/remove elements,
                // create all elements before updating their values
                updateAll(data.data);
                break;
            case "update-item":
                updateItem(data.item, data.values);
                break;
        }
    };

    // Function to update an item's specified HTML elements
    function updateItem(itemName, itemData) {
        var item = document.getElementById(itemName);
        for (let valueName in itemData) {
            if (valueName === "src") {
                // forces the image to be re-requested so page doesn't
                // need to be refreshed
                item[valueName] = itemData[valueName] + "&_=" + performance.now();
            } else {
                item[valueName] = itemData[valueName];
            }
        }
        updatedItems[itemName] = itemData;
    }

    // Updates all of the HTML elements in items
    function updateAll(items) {
        updatedItems = items;
        for (let item in updatedItems) {
            updateItem(item, updatedItems[item]);
        }
    }

    // Uploads an image file to the server stored under the id
    // of the element
    async function uploadImage(file, id) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('element', id);
        formData.append('roomId', roomId);

        // upload image to server
        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        // We return true if the image has been successfully uploaded
        if (res.status === 200) {
            return true;
        } else {
            console.error(`Failed to upload image for element ${id}`);
            return false;
        }
    }

    // ALL UPDATEABLE ITEMS GO BELOW THIS LINE
    // To add an item, give it a unique id and add it to updatedItems
    // as part of the event listener*. Send the updated values over the
    // socket with "item" corresponding to the item id and "values"
    // being a dictionary of { changed HTML element: value }
    //
    // *unless it is a textbox, in which case bind it to our ydoc instead
    // add to list of inputs below if it exists on the page at load
    // else use the addNewTextbox method and it will set everything up

    // setup initial textboxes
    const inputs = ["initiativeName", "initiativeBox", "conditionsName", "conditionsBox"];
    for (let i of inputs) {
        bindTextboxToYjs(i);
    }
    
    // ALL ITEMS WITH UPLOADED IMAGES GO BELOW THIS LINE
    // To handle items with uploaded images, give the item a unique
    // id and an eventListener for the image being uploaded. When an
    // image is uploaded by the client, call uploadImage(file, item id)
    // to upload the image to the server. Then send an "update-item" 
    // message over the socket, with values: { "src": "/server-image/[element id]"}
    //
    // Important note: it is REALLY important that we listen for the image submission,
    // and not the image loading to avoid sending constant messages. You can see the
    // mapBg example, where we listen for 'change' in 'fileInput' (which keeps track
    // of the current uploaded map image) and not 'load' in 'mapBg'.

    // TODO: move and name the function so it can be reused for other images
    // mapBg
    const mapFile = document.getElementById('fileInput');
    mapFile.addEventListener('change', async function() {
        const file = this.files[0];
        const imgUploaded = await uploadImage(file, 'mapBg');
        if (!imgUploaded) {
            // failed image upload, don't send a message
            return;
        }

        const data = { "src": `/server-image/mapBg?room=${roomId}` };
        updatedItems["mapBg"] = data;
        socket.send(JSON.stringify({
            event: "update-item",
            item: "mapBg",
            values: data
        }));
    });
}

export function joinRoom() {
    const roomId = document.getElementById("roomId").value.trim().toUpperCase();
    if (!roomId) {
        alert("Please enter a room id");
        return;
    }
    document.getElementById("landing").classList.add("hidden");
    document.getElementById("roomContent").classList.remove("hidden");

    startWebSocket(encodeURIComponent(roomId));
}
window.joinRoom = joinRoom;