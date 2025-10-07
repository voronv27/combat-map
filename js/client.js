// This file contains all code related to interacting with the server, whether
// sending the server messages when the client modifies something on the site,
// or getting messages from the server from another client's changes

// Connect to server
var url = new URL("./start_web_socket", location.href);
url.protocol = url.protocol.replace("http", "ws");
const socket = new WebSocket(url);

// Listen for server messages and update page elements
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.event) {
        case "request-all":
            // TODO: keep track of all editable elements and send their values
            const statusBox = document.getElementById("statusBox");
            socket.send(JSON.stringify({
                event: "request-all",
                data: {"statusBox": statusBox.value},
            }));
            break;
        case "update-all":
            // TODO: updateAll function when we add more elements
            updateStatusBox(data.data.statusBox);
            break;
        case "status-update":
            updateStatusBox(data.text);
            break;

        // TODO: add more cases for different events
    }
};

// TODO: may be easier to create a function for any text elements and pass in id as a param
function updateStatusBox(text) {
    var statusBox = document.getElementById("statusBox");
    statusBox.value = text;
}

// Send messages to the server when modifying page elements
// TODO: consider adding jquery to project and change this to listen for
// changes to anything with a "textbox"  (similar philosophy for added objects)
const statusBoxInput = document.getElementById("statusBox");
statusBoxInput.addEventListener('input', function() {
    const input = statusBoxInput.value;
    socket.send(JSON.stringify({ event: "status-update", text: input }));
});
