function log(message) {
    let element = document.getElementById("output");
    element.innerText += message;
    element.innerText += "\n";
}

const MessageType = {
    MatchId: "MatchId",
    MatchStart: "MatchStart",
    InputTx: "InputTx",
    GameStateTx: "GameStateTx"
};

const State = {
    WaitingPlayer: 0,
    GameActive: 1,
    GameEnded: 2
};

const Role = {
    Unassigned: "Unassigned",
    Host: "Host",
    Client: "Client"
};

let midAttr = "mid";

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

let constants = {
    dimensions: new Vector(500.0, 360.0),
    ballSpeed: 50,
    maxReflect: Math.PI / 3.0,
    digitContext: BlockDigit.createContext(40, 80, 10)
}

class GameState {
    constructor(role, state) {
        this.role = role;
        this.state = state;
        this.paddle1 = new GameObject(new Vector(10, 80), new Vector(0, 0), new Vector(10, 50));
        this.paddle2 = new GameObject(new Vector(constants.dimensions.x - 16, 130), new Vector(0, 0), new Vector(10, 50));
        this.ball = new GameObject(new Vector(0, 0), new Vector(0.0, 0.0), new Vector(10, 10));
        this.score = { a: 0, b: 0 };
        this.simulateBall = true;
    }
}

function updateGameState(gameState, inputPosition, dt) {
    const dimensions = constants.dimensions;
    const canvas = $("#canvas").get(0);
    const topOffset = canvas.offsetTop;

    // Update the paddle.
    var newPos = inputPosition.y - gameState.paddle1.size.y / 2.0;
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
            setTimeout(function() { restoreBallState(gameState, false); }, 3000);
        }
        else if (ball.velocity.x < 0.0 && ball.position.x <= 0.0) {
            ball.velocity.x *= -1.0;
            gameState.score.b += 1;
            gameState.simulateBall = false;
            setTimeout(function() { restoreBallState(gameState, true); }, 3000);
        }

        if ((ball.velocity.y > 0.0 && ball.position.y >= dimensions.y - ball.size.y) ||
            (ball.velocity.y < 0.0 && ball.position.y <= 0.0)) {
            ball.velocity.y *= -1.0;
        }
    }
}

function reflect(paddle, ball, left) {
    const maxReflect = constants.maxReflect;
    const ballSpeed = constants.ballSpeed;

    const paddleY = paddle.position.y + paddle.size.y / 2.0;
    const ballY = ball.position.y + ball.size.y / 2.0;
    const ratio = (paddleY - ballY) / (paddle.size.y / 2.0);

    const reflectAngle = maxReflect * Math.abs(ratio);
    ball.velocity.x = ballSpeed * Math.cos(reflectAngle);
    if (left) {
        ball.velocity.x *= -1.0;
    }
    ball.velocity.y = ballSpeed * Math.sin(reflectAngle);
    if (ratio > 0.0) {
        ball.velocity.y *= -1.0;
    }
}

function restoreBallState(gameState, left) {
    const dimensions = constants.dimensions;
    const ballSpeed = constants.ballSpeed;

    const vx = ballSpeed * Math.cos(Math.PI / 4.0);
    const vy = ballSpeed * Math.sin(Math.PI / 4.0);
    gameState.ball.position = new Vector(dimensions.x / 2.0, dimensions.y * 0.3);
    gameState.ball.velocity = new Vector(left ? -vx : vx, vy);
    gameState.simulateBall = true;
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

/** Reflect the current game state to be sent over the wire */
function packGameStateMessage(state) {
    return {
        type: MessageType.GameStateTx,
        payload: {
            paddle1: state.paddle1.position,
            paddle2: state.paddle2.position,
            ball: state.ball.position,
            score: state.score,
        }
    }
}

/** Load the game state from the network message received */
function unpackGameStateMessage(packed, state) {
    state.paddle1.position = packed.paddle1;
    state.paddle2.position = packed.paddle2;
    state.ball.position = packed.ball;
    state.score = packed.score;
}

/** Offset an input position to canvas coordinates */
function offsetForCanvas(position, canvas) {
    const topOffset = canvas.offsetTop;
    const leftOffset = canvas.offsetLeft;
    return new Vector(position.x - leftOffset, position.y - topOffset);
}

/** Read 'mid' off of the active url */
function getUrlMatchId() {
    let params = window.location.search.substring(1).split(new RegExp("=|\&"));
    var mid = null;
    for (var i = 0; i < params.length - 1; i++) {
        if (params[i] === midAttr) {
            mid = params[i + 1];
            break;
        }
    }
    return mid;
}

/** Draw the current game state */
function drawGame(gameState) {
    const dimensions = constants.dimensions;
    let context = $("#canvas").get(0).getContext("2d");
    drawBackground(context, dimensions);

    context.fillStyle = "white";
    drawObject(context, gameState.paddle1);
    drawObject(context, gameState.paddle2);
    if (gameState.simulateBall) {
        drawObject(context, gameState.ball);
    }

    context.strokeStyle = "white";
    context.save();
    BlockDigit.drawDigit(dimensions.x / 2.0 - 60.0, 10.0, gameState.score.a % 10, context, constants.digitContext);
    BlockDigit.drawDigit(dimensions.x / 2.0 + 20.0, 10.0, gameState.score.b % 10, context, constants.digitContext);
    context.restore();
}

function showInterface() {
    // TODO: add / remove the div
    $("#interface").css("opacity", 1.0);
}

function hideInterface() {
    $("#interface").css("opacity", 0.0);
}

/** Start the menu flow */
function runMenu() {
    showInterface();

    $("#loadingIndicator").hide();
    $("#joinEntry").hide();
    $("#hostEntry").hide();

    $("#hostButton").click(function() {
        var continueAnimation = true;
        $("#hostJoin").hide();
        $("#hostEntry").show();
        $("#hostMessaging").hide();
        animateLoadingIndicator(function() { return continueAnimation; });

        let match = runMatch(null);
        match.midReceived = function(mid) {
            $("#loadingIndicator").css("opacity", 0.0);
            $("#interface").append('<div id="hostAddress"></div>');
            $("#hostAddress").text(mid);
            continueAnimation = false;
        };

        match.matchStarted = function() {
            $("#hostAddress").remove();
            hideInterface();
        }

        match.connectionError = function() {
            $("#hostMessaging").text("Failed to connect to the server and start a hosted match.");
            $("#hostMessaging").show();
            continueAnimation = false;
        }

        match.connectionClosed = function() {
        }
    });

    $("#joinButton").click(function() {
        $("#hostJoin").hide();
        $("#joinEntry").show();
        $("#joinMessaging").hide();

        $("#matchInput").css("opacity", 1.0);
        $("#matchInput").get(0).focus();
        $("#matchInput").keyup(function() {
            let value = $("#matchInput").val();
            if (value.length == 4) {
                let match = runMatch(value);
                match.matchStarted = function() {
                    hideInterface();
                }
            }
        })
    });
}

function animateLoadingIndicator(shouldContinue) {
    let element =  $("#loadingIndicator");
    element.show();
    let interval = 400;
    element.text(" ");
    window.setTimeout(function() {
        element.text(".");
        window.setTimeout(function() {
            element.text("..");
            window.setTimeout(function() {
                element.text("...");
                window.setTimeout(function() {
                    if (shouldContinue()) {
                        animateLoadingIndicator(shouldContinue);
                    }
                    else {
                        element.hide();
                    }
                }, interval);
            }, interval);
        }, interval);
    }, interval);
}

function drawConnecting() {
    const dimensions = constants.dimensions;
    let context = $("#canvas").get(0).getContext("2d");
    drawBackground(context, dimensions);

    context.fillText("loading...", 0, 0);
}

function drawBackground(context, dimensions) {
    context.fillStyle = "black";
    context.fillRect(0, 0, dimensions.x, dimensions.y);
    context.fillStyle = "white";
    context.strokeStyle = "white";
    context.lineWidth = 10;
    context.save();
    context.beginPath();
    context.setLineDash([8, 8]);
    context.moveTo(dimensions.x / 2.0, 0.0);
    context.lineTo(dimensions.x / 2.0, dimensions.y);
    context.stroke();
    context.restore();
}

/** The self-rescheduling  game loop for both host and client updates */
function gameLoop(gameState, connection, inputPosition, time) {
    if (gameState.role == Role.Host) {
        updateGameState(gameState, inputPosition, 0.04);
        let message = packGameStateMessage(gameState);
        let messageData = JSON.stringify(message);
        connection.send(messageData);
    }
    else {
        // transmit mouse position
    }
    drawGame(gameState);

    window.requestAnimationFrame(function(time) {
        gameLoop(gameState, connection, inputPosition, time);
    });
}

function startup() {
    $("#interface").css("opacity", 0.0);
    // Either start a hosted match, or provide the option to host or enter a match code.
    // Evaluate the url parameter here, it could have been provided to jumpstart the match.
    let mid = getUrlMatchId()
    if (mid === null) {
        runMenu();
    } else {
        runMatch(mid);
    }
}

/** Initialize comms, establish the role of this instance of the game, and kick off the match */
function runMatch(mid) {
    let match = {
        midReceived: function(mid) {},
        matchStarted: function() {},
        matchEnded: function() {},
        connectionError: function() {},
        connectionClosed: function() {}
    };

    let gameState = new GameState(Role.Unassigned, State.WaitingPlayer);
    let gameUrl = "ws://localhost:8080";
    if (mid != null) {
        gameUrl = gameUrl + "?" + midAttr + "=" + mid;
    }
    
    let ws = new WebSocket(gameUrl);
    ws.onerror = function(event) {
        log("error!");
        match.connectionError();
    }
    ws.onopen = function(event) {
        log("connected!");
    }
    ws.onclose = function(event) {
        log("close!");
        match.connectionClosed();
    }
    ws.onmessage = function(event) {
        // log("rx: " + event.data);
        let message = JSON.parse(event.data);
        if (message.type === MessageType.MatchId) {
            match.midReceived(message.payload.mid);
        }
        else if (message.type === MessageType.MatchStart) {
            match.matchStarted();
            gameState.role = message.payload.role;
            runGame(gameState, ws);
        }
        else if (message.type === MessageType.InputTx) {
            log("got an input message...");
        }
        else if (message.type === MessageType.GameStateTx) {
            unpackGameStateMessage(message.payload, gameState);
        }
    }

    return match;
}

/** Start up the game loop, read input */
function runGame(gameState, connection) {
    let canvas = $("canvas").get(0);

    restoreBallState(gameState, true);
    var inputPosition = new Vector(0, 0);
    document.onmousemove = function(event) {
        let pagePos = new Vector(event.pageX, event.pageY);
        let canvasPos = offsetForCanvas(pagePos, canvas);
        inputPosition.x = canvasPos.x;
        inputPosition.y = canvasPos.y;
    };
    window.requestAnimationFrame(function(time) {
        gameLoop(gameState, connection, inputPosition, time);
    });
}
