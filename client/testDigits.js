class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

function log(message) {
    let element = document.getElementById("output");
    element.innerText += message;
    element.innerText += "\n";
}

var server = false;
var position = new Vector(0.0, 0.0);

function runLoop() {
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    context.fillStyle = "#333333";

    context.fillRect(0, 0, 200, 200);

    let width = 50;
    let height = 100;
    let lineWidth = 10;

    let buffer = lineWidth / 2.0;
    
    context.fillStyle = "white";
    context.strokeStyle = "white";
    context.lineWidth = lineWidth;

    context.beginPath();

    // Verticals
    segments = [
        [0, buffer, width, buffer], // Top 0
        [0, height / 2.0 - buffer / 2.0, width, height / 2.0 - buffer / 2.0], // Mid 1
        [0, height - lineWidth, width, height - lineWidth], // Bottom 2
        [buffer, 0, buffer, height / 2.0 - buffer / 2.0], // Left-Top 3
        [ buffer, height / 2.0 - buffer / 2.0, buffer, height - buffer ], // Left-Bottom 4
        [ width - buffer, 0, width - buffer, height / 2.0 - buffer / 2.0 ], // Right-Top 5
        [ width - buffer, height / 2.0 - buffer / 2.0, width - buffer, height - buffer ] // Right-Bottom 6
    ]

    // let indexes = [0, 2, 3, 4, 5, 6] // 0
    // let indexes = [5, 6] // 1
    // let indexes = [0, 1, 2, 4, 5] // 2
    // let indexes = [0, 1, 2, 5, 6] // 3
    // let indexes = [1, 3, 5, 6] // 4
    // let indexes = [0, 1, 2, 3, 6] // 5
    // let indexes = [0, 1, 2, 3, 4, 6] // 6
    // let indexes = [0, 5, 6] // 7
    // let indexes = [0, 1, 2, 3, 4, 5, 6] // 8
    let indexes = [0, 1, 2, 3, 5, 6] // 9

    for (var i = 0; i < indexes.length; i++) {
        let segment = segments[indexes[i]];
        context.moveTo(segment[0], segment[1]);
        context.lineTo(segment[2], segment[3]);
    }

    context.stroke();

    window.requestAnimationFrame(runLoop);
}

function testDigits() {
    document.onmousemove = function(event) {
        mousePos = new Vector(event.pageX, event.pageY);
        if (server) {
            let mp = JSON.stringify(mousePos);
            ws.send(mp);
        }
    };
    window.requestAnimationFrame(runLoop);
}
