function log(message) {
    let element = document.getElementById("output");
    element.innerText += message;
    element.innerText += "\n";
}

function testComms() {
    log("connecting...");
    let ws = new WebSocket("ws://localhost:8080");
    ws.onerror = function(event) {
        log("error!");
    }

    ws.onopen = function(event) {
        function sendMessage() {
            ws.send("testing...");
        }
        setInterval(sendMessage, 500);
    }

    ws.onclose = function(event) {
        log("close!");
    }

    ws.onmessage = function(event) {
        log("message!");
    }
}
