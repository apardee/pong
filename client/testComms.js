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
        log("connected!");
    }

    ws.onclose = function(event) {
        log("close!");
    }

    ws.onmessage = function(event) {
        log(event.data);
        if (event.data === "start") {
            ws.send("1");
        }
        else {
            const value = parseInt(event.data);
            setTimeout(function() { ws.send((value + 1).toString()); }, 200)
        }
    }
}
