// This file contains all code related to interacting with the server, whether
// sending the server messages when the client modifies something on the site,
// or getting messages from the server from another client's changes

// Connect to server
var url = new URL("./start_web_socket", location.href);
url.protocol = url.protocol.replace("http", "ws");
const socket = new WebSocket(url);

// store updated items as { "itemId": { "changeablePropertyName": value }}
var updatedItems = {};

// Listen for server messages and update page elements
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.event) {
        case "request-all":
            socket.send(JSON.stringify({
                event: "request-all",
                data: updatedItems,
            }));
            break;
        case "update-all":
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
        item[valueName] = itemData[valueName];
    }
}

// Updates all of the HTML elements in items
function updateAll(items) {
    updatedItems = items;
    for (item in updatedItems) {
        updateItem(item, updatedItems[item]);
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

// TODO: map image
