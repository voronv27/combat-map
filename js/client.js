// This file contains all code related to interacting with the server, whether
// sending the server messages when the client modifies something on the site,
// or getting messages from the server from another client's changes

async function startWebSocket(roomId) {
    // Connect to server
    var url = new URL("./start_web_socket?room=" + roomId,
        location.href);
    url.protocol = url.protocol.replace("http", "ws");
    const socket = new WebSocket(url);

    // store updated items as { "itemId": { "changeablePropertyName": value }}
    var updatedItems = {};

    // Listen for server messages and update page elements
    socket.onmessage = (event) => {
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
        for (valueName in itemData) {
            if (valueName === "src") {
                // forces the image to be re-requested so page doesn't
                // need to be refreshed
                item[valueName] = itemData[valueName] + "&_=" + performance.now();
            }
            else {
                item[valueName] = itemData[valueName];
            }
        }
        updatedItems[itemName] = itemData;
    }

    // Updates all of the HTML elements in items
    function updateAll(items) {
        updatedItems = items;
        for (item in updatedItems) {
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
    // as part of the event listener. Send the updated values over the
    // socket with "item" corresponding to the item id and "values"
    // being a dictionary of { changed HTML element: value }

    // statusBox
    const statusBoxInput = document.getElementById("statusBox");
    statusBoxInput.addEventListener('input', function() {
        const data = { "value": statusBoxInput.value };
        updatedItems["statusBox"] = data;
        socket.send(JSON.stringify({
            event: "update-item",
            item: "statusBox",
            values: data
        }));
    });

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

const joinBtn = document.getElementById("joinRoom");
joinBtn.addEventListener("click", () => {
    const roomId = document.getElementById("roomId").value.trim();
    if (!roomId) {
        alert("Please enter a room id");
        return;
    }
    document.getElementById("landing").style.display = "none";
    document.getElementById("roomContent").style.display = "block";

    startWebSocket(encodeURIComponent(roomId));
});