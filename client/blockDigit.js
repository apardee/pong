let BlockDigit = (function() {
    var exports = {}

    exports.createContext = function(width, height, lineWidth) {
        let buffer = lineWidth / 2.0;
        return {
            segments: [
                [0, buffer, width, buffer], // Top 0
                [0, height / 2.0 - buffer / 2.0, width, height / 2.0 - buffer / 2.0], // Mid 1
                [0, height - lineWidth, width, height - lineWidth], // Bottom 2
                [buffer, 0, buffer, height / 2.0 - buffer / 2.0], // Left-Top 3
                [ buffer, height / 2.0 - buffer / 2.0, buffer, height - buffer ], // Left-Bottom 4
                [ width - buffer, 0, width - buffer, height / 2.0 - buffer / 2.0 ], // Right-Top 5
                [ width - buffer, height / 2.0 - buffer / 2.0, width - buffer, height - buffer ] // Right-Bottom 6
            ],
            lineWidth: lineWidth
        }
    }

    exports.drawDigit = function(x, y, digit, context, segments) {
        context.fillStyle = "white";
        context.strokeStyle = "white";
        context.lineWidth = segments.lineWidth;
        context.beginPath();

        var indexes = []
        switch (digit) {
            case 0: indexes = [0, 2, 3, 4, 5, 6]; break;
            case 1: indexes = [5, 6]; break;
            case 2: indexes = [0, 1, 2, 4, 5]; break;
            case 3: indexes = [0, 1, 2, 5, 6]; break;
            case 4: indexes = [1, 3, 5, 6]; break;
            case 5: indexes = [0, 1, 2, 3, 6]; break;
            case 6: indexes = [0, 1, 2, 3, 4, 6]; break;
            case 7: indexes = [0, 5, 6]; break;
            case 8: indexes = [0, 1, 2, 3, 4, 5, 6]; break;
            case 9: indexes = [0, 1, 2, 3, 5, 6]; break;
        }

        let drawSegments = segments.segments;
        for (var i = 0; i < indexes.length; i++) {
            let segment = drawSegments[indexes[i]];
            context.moveTo(segment[0] + x, segment[1] + y);
            context.lineTo(segment[2] + x, segment[3] + y);
        }
        context.stroke();
    }

    return exports;
})()

function runLoop() {
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    context.fillStyle = "#333333";
    context.fillRect(0, 0, 200, 200);

    let width = 50;
    let height = 100;
    let lineWidth = 10;

    let segments = BlockDigit.createContext(width, height, lineWidth);
    BlockDigit.drawDigit(20, 20, 7, context, segments);

    window.requestAnimationFrame(runLoop);
}
