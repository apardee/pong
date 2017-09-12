class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class GameObject {
    constructor(position, velocity, size) {
        this.position = position ? position : Vector(0, 0);
        this.velocity = velocity ? velocity : Vector(0, 0);
        this.size = size ? size : Vector(0, 0);
    }
}

const Role = {
    Server: 0,
    Client: 1
};

class GameState {
    constructor(role) {
        this.constants = {
            dimensions: new Vector(500.0, 360.0),
            ballSpeed: 50,
            maxReflect: Math.PI / 3.0
        };

        this.role = role;
        this.paddle1 = new GameObject(new Vector(10, 80), new Vector(0, 0), new Vector(10, 50));
        this.paddle2 = new GameObject(new Vector(this.constants.dimensions.x - 16, 130), new Vector(0, 0), new Vector(10, 50));
        this.ball = new GameObject(new Vector(0, 0), new Vector(0.0, 0.0), new Vector(10, 10));
        this.score = { a: 0, b: 0 };
        this.simulateBall = true;
    }
}

var mousePos = new Vector(0, 0);
var gameState = new GameState(Role.Server);

function initializeGame() {
    restoreBallState(true);
}

function updateGameState(dt) {
    const dimensions = gameState.constants.dimensions;
    const canvas = document.getElementById("canvas");
    const topOffset = canvas.offsetTop;

    // Update the paddle.
    var newPos = mousePos.y - topOffset - gameState.paddle1.size.y / 2.0;
    if (newPos <= 2.0) {
        newPos = 2.0;
    }
    else if (newPos > dimensions.y - gameState.paddle1.size.y - 2.0) {
        newPos = dimensions.y - gameState.paddle1.size.y - 2.0;
    }
    gameState.paddle1.position.y = newPos;
    gameState.paddle2.position.y = newPos;

    // Update the ball.
    if (gameState.simulateBall) {
        var ball = gameState.ball;
        ball.position.x = ball.position.x + ball.velocity.x * dt;
        ball.position.y = ball.position.y + ball.velocity.y * dt;

        if (ball.velocity.x > 0.0 && collides(ball, gameState.paddle2)) {
            reflect(gameState.paddle2, ball, true);
        }

        if (ball.velocity.x < 0.0 && collides(ball, gameState.paddle1)) {
            reflect(gameState.paddle1, ball, false);
        }

        // Collision detect wall vs. bounds.
        if (ball.velocity.x > 0.0 && ball.position.x >= dimensions.x - ball.size.x) {
            ball.velocity.x *= -1.0;
            gameState.score.a += 1;
            gameState.simulateBall = false;
            setTimeout(function() { restoreBallState(false); }, 3000);
        }
        else if (ball.velocity.x < 0.0 && ball.position.x <= 0.0) {
            ball.velocity.x *= -1.0;
            gameState.score.b += 1;
            gameState.simulateBall = false;
            setTimeout(function() { restoreBallState(true); }, 3000);
        }

        if ((ball.velocity.y > 0.0 && ball.position.y >= dimensions.y - ball.size.y) ||
            (ball.velocity.y < 0.0 && ball.position.y <= 0.0)) {
            ball.velocity.y *= -1.0;
        }
    }
}

function reflect(paddle, ball, left) {
    const maxReflect = gameState.constants.maxReflect;
    const ballSpeed = gameState.constants.ballSpeed;

    const paddleY = paddle.position.y + paddle.size.y / 2.0;
    const ballY = gameState.ball.position.y + ball.size.y / 2.0;
    const ratio = (paddleY - ballY) / (paddle.size.y / 2.0);

    const reflectAngle = maxReflect * Math.abs(ratio);
    ball.velocity.x = ballSpeed * Math.cos(reflectAngle);
    if (left) {
        ball.velocity.x *= -1.0;
    }
    ball.velocity.y = ballSpeed * Math.sin(reflectAngle);
    if (ratio > 0.0) {
        gameState.ball.velocity.y *= -1.0;
    }
}

function restoreBallState(left) {
    const dimensions = gameState.constants.dimensions;
    const ballSpeed = gameState.constants.ballSpeed;

    const vx = ballSpeed * Math.cos(Math.PI / 4.0);
    const vy = ballSpeed * Math.sin(Math.PI / 4.0);
    gameState.ball.position = new Vector(dimensions.x / 2.0, dimensions.y * 0.3);
    gameState.ball.velocity = new Vector(left ? -vx : vx, vy);
    gameState.simulateBall = true;
}

function drawGame() {
    const dimensions = gameState.constants.dimensions;

    canvas = document.getElementById("canvas");
    var context = canvas.getContext("2d");
    context.fillStyle = "black";
    context.fillRect(0, 0, dimensions.x, dimensions.y);
    window.requestAnimationFrame(gameLoop);

    context.fillStyle = "white";
    drawObject(context, gameState.paddle1);
    drawObject(context, gameState.paddle2);
    if (gameState.simulateBall) {
        drawObject(context, gameState.ball);
    }

    context.font = "30px monospace";
    context.fillText(gameState.score.a.toString(), dimensions.x / 2.0 - 30.0, 30.0);
    context.fillText(gameState.score.b.toString(), dimensions.x / 2.0 + 12.0, 30.0);

    context.strokeStyle = "white";
    context.lineWidth = 10;
    context.beginPath();
    context.setLineDash([8, 8]);
    context.moveTo(dimensions.x / 2.0, 0.0);
    context.lineTo(dimensions.x / 2.0, dimensions.y);
    context.stroke();
}

function drawObject(context, object) {
    context.fillRect(
        object.position.x,
        object.position.y,
        object.size.x,
        object.size.y);
}

function collides(obj1, obj2) {
    if (obj1.position.x > obj2.position.x + obj2.size.x ||
        obj1.position.x + obj1.size.x < obj2.position.x ||
        obj1.position.y > obj2.position.y + obj2.size.y ||
        obj1.position.y + obj1.size.y < obj2.position.y) {
        return false;
    }
    return true;
}

function gameLoop(time) {
    if (gameState.role == Role.Server) {
        updateGameState(0.04);
    }
    drawGame();
}

function runGame() {
    initializeGame();
    document.onmousemove = function(event) {
        mousePos = new Vector(event.pageX, event.pageY);
    };
    window.requestAnimationFrame(gameLoop);
}