class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

let mousePos = new Vector(0.0, 0.0);

function log(message) {
    let element = document.getElementById("output");
    element.innerText += message;
    element.innerText += "\n";
}

function runLoop() {
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    context.fillStyle = "#333333";
    context.fillRect(0, 0, 200, 200);

    context.fillStyle = "white";
    context.fillRect(mousePos.x - canvas.offsetLeft, mousePos.y - canvas.offsetTop, 10, 10);

    window.requestAnimationFrame(runLoop);
}

function testDraw() {
    // log("connecting...");
    // let ws = new WebSocket("ws://localhost:8080");
    // ws.onerror = function(event) {
    //     log("error!");
    // }

    // ws.onopen = function(event) {
    //     log("connected!");
    // }

    // ws.onclose = function(event) {
    //     log("close!");
    // }

    // ws.onmessage = function(event) {
    //     log(event.data);
    //     if (event.data === "start") {
    //         ws.send("1");
    //     }
    //     else {
    //         const value = parseInt(event.data);
    //         setTimeout(function() { ws.send((value + 1).toString()); }, 200)
    //     }
    // }
    
    document.onmousemove = function(event) {
        mousePos = new Vector(event.pageX, event.pageY);
    };
    window.requestAnimationFrame(runLoop);

    log("hello");
}
