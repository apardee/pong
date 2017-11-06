function log(message) {
    let element = document.getElementById("output");
    element.innerText += message;
    element.innerText += "\n";
}

const MessageType = {
    MatchId: "MatchId",
    MatchStart: "MatchStart",
    MatchComplete: "MatchComplete",
    InputTx: "InputTx",
    GameStateTx: "GameStateTx",
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

let Constants = {
    dimensions: new Vector(500.0, 360.0),
    ballSpeed: 50,
    maxReflect: Math.PI / 3.0,
    digitContext: BlockDigit.createContext(40, 80, 10),
    winScore: 1
}

class GameObject {
    constructor(position, velocity, size) {
        this.position = position ? position : Vector(0, 0);
        this.velocity = velocity ? velocity : Vector(0, 0);
        this.size = size ? size : Vector(0, 0);
    }
}

class GameState {
    constructor(role, state) {
        this.role = role;
        this.state = state;
        this.paddle1 = new GameObject(new Vector(10, 80), new Vector(0, 0), new Vector(10, 50));
        this.paddle2 = new GameObject(new Vector(Constants.dimensions.x - 16, 130), new Vector(0, 0), new Vector(10, 50));
        this.ball = new GameObject(new Vector(0, 0), new Vector(0.0, 0.0), new Vector(10, 10));
        this.score = { a: 0, b: 0 };
        this.simulateBall = true;
    }
}

function updateGameState(gameState, inputPosition, dt, gameEvents) {
    const dimensions = Constants.dimensions;
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
            if (gameState.score.a >= Constants.winScore) {
                gameEvents.gameComplete(gameState);
            }
            gameState.simulateBall = false;
            setTimeout(function() { restoreBallState(gameState, false); }, 3000);
        }
        else if (ball.velocity.x < 0.0 && ball.position.x <= 0.0) {
            ball.velocity.x *= -1.0;
            gameState.score.b += 1;
            if (gameState.score.b >= Constants.winScore) {
                gameEvents.gameComplete(gameState);
            }
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
    const maxReflect = Constants.maxReflect;
    const ballSpeed = Constants.ballSpeed;

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
    const dimensions = Constants.dimensions;
    const ballSpeed = Constants.ballSpeed;

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

/** Message data for transmitting input position */
function packInputMessage(inputPos) {
    return {
        type: MessageType.InputTx,
        payload: {
            inputPos: inputPos
        }
    }
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
    const dimensions = Constants.dimensions;
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
    BlockDigit.drawDigit(dimensions.x / 2.0 - 60.0, 10.0, gameState.score.a % 10, context, Constants.digitContext);
    BlockDigit.drawDigit(dimensions.x / 2.0 + 20.0, 10.0, gameState.score.b % 10, context, Constants.digitContext);
    context.restore();
}

/** Start the menu flow */
function runMenu(inputContext, message) {
    inputContext.reset();
    $("#interface").show();
    hideAllElements();
    $("#hostJoin").show();

    if (message != null) {
        $("#hostJoinError").show();
        $("#hostJoinError").text(message);
    } else {
        $("#hostJoinError").hide();
    }

    inputContext.returnPressed = function() {
        runMenu(inputContext);
        log("return pressed!");
    };

    inputContext.hostPressed = function() {
       showHostOptions(inputContext);
    };

    inputContext.joinPressed = function() {
       showJoinOptions(inputContext);
    };
}

function showHostOptions(inputContext) {
    $("#hostJoin").hide();
    $("#hostEntry").show();
    $("#hostMessaging").hide();
    hostMatch(inputContext);
}

function showJoinOptions(inputContext) {
    $("#hostJoin").hide();
    $("#joinEntry").show();
    $("#joinMessaging").hide();

    $("#matchInput").show();
    $("#matchInput").get(0).focus();
    inputContext.matchInputChanged = function() {
        let mid = $("#matchInput").val();
        if (mid.length == 4) {
            joinMatch(mid, inputContext);
        } else {
            $("#joinMessaging").text("");
        }
    }
}

function hostMatch(inputContext) {
    let indicatorState = startLoadingIndicator();
    let match = runMatch(null, inputContext);
    var errorFirst = false;
    match.midReceived = function(mid) {
        $("#loadingIndicator").css("opacity", 0.0);
        $("#hostAddress").text(mid);
        $("#hostAddress").show();
        stopLoadingIndicator(indicatorState);
    };

    match.matchStarted = function() {
        $("#interface").hide();
    }

    match.matchEnded = function() {
        showRematchOptions(inputContext);
    }

    match.connectionError = function() {
        $("#hostMessaging").text("Couldn't connect to the server to host a match.");
        $("#hostMessaging").show();
        $("#return").show();
        stopLoadingIndicator(indicatorState);
        errorFirst = true;
    }

    match.connectionClosed = function() {
        if (errorFirst == false) {
            runMenu(inputContext, "Connection lost!");
        }
    }
}

function joinMatch(mid, inputContext) {
    let indicatorState = startLoadingIndicator();
    var errorFirst = false;

    let match = runMatch(mid, inputContext);
    match.matchStarted = function() {
        $("#interface").hide();
        stopLoadingIndicator(indicatorState);
    }

    match.matchEnded = function() {
        showRematchOptions(inputContext);
    }

    match.connectionError = function() {
        $("#joinMessaging").text("Couldn't join a match with that match code. Verify that the host's match is ready and try again.");
        $("#joinMessaging").show();
        $("#return").show();
        stopLoadingIndicator(indicatorState);
        errorFirst = true;
    }

    match.connectionClosed = function() {
        if (errorFirst == false) {
            runMenu(inputContext, "Connection lost!");
        }
    }
}

function startLoadingIndicator() {
    var state = {
        shouldContinue : true
    }

    animateLoadingIndicator(function() {
        return state.shouldContinue;
    });

    return state;
}

function stopLoadingIndicator(state) {
    state.shouldContinue = false;
    $("#loadingIndicator").hide();
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
                }, interval);
            }, interval);
        }, interval);
    }, interval);
}

function drawConnecting() {
    const dimensions = Constants.dimensions;
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
function gameLoop(gameState, connection, inputPosition, time, gameEvents) {
    if (gameState.role == Role.Host) {
        updateGameState(gameState, inputPosition, 0.04, gameEvents);
        let message = packGameStateMessage(gameState);
        let messageData = JSON.stringify(message);
        connection.send(messageData);
    }
    else {
        let message = packInputMessage(inputPosition);
        let messageData = JSON.stringify(message);
        connection.send(messageData);
    }
    drawGame(gameState);
}

function setupInputContext() {
    let inputContext = {
        reset: function() {
            inputContext.returnPressed = function() {};
            inputContext.joinPressed =  function() {};
            inputContext.hostPressed =  function() {};
            inputContext.matchInputChanged =  function() {};
        }
    }
    inputContext.reset();
    $("#returnButton").click(function() { inputContext.returnPressed(); });
    $("#joinButton").click(function() { inputContext.joinPressed(); });
    $("#hostButton").click(function() { inputContext.hostPressed(); });
    $("#matchInput").keyup(function() { inputContext.matchInputChanged(); });
    return inputContext;
}

/** Entry point from document.onload */
function startup() {
    let inputContext = setupInputContext();

    $("#interface").hide();
    // Either start a hosted match, or provide the option to host or enter a match code.
    // Evaluate the url parameter here, it could have been provided to jumpstart the match.
    let mid = getUrlMatchId()
    if (mid === null) {
        runMenu(inputContext);
    } else {
        joinMatch(mid, inputContext);
    }
}

/** Initialize comms, establish the role of this instance of the game, and kick off the match */
function runMatch(mid, inputContext, ws) {
    // Callbacks to the match UI.
    let matchCallbacks = {
        midReceived: function(mid) {},
        matchStarted: function() {},
        matchEnded: function(ws) {},
        connectionError: function() {},
        connectionClosed: function() {}
    };

    // Callbacks to the running game.
    let gameCallbacks = {
        connectionClosed: function() {}
    };

    if (ws == null) {
        let gameUrl = "ws://localhost:8080";
        if (mid != null) {
            gameUrl = gameUrl + "?" + midAttr + "=" + mid;
        }
        ws = new WebSocket(gameUrl);
    }

    let gameState = new GameState(Role.Unassigned, State.WaitingPlayer);
    ws.onerror = function(event) {
        matchCallbacks.connectionError();
        gameCallbacks.connectionClosed();
    }
    ws.onopen = function(event) {
    }
    ws.onclose = function(event) {
        matchCallbacks.connectionClosed();
        gameCallbacks.connectionClosed();
    }
    ws.onmessage = function(event) {
        // log("rx: " + event.data);
        let message = JSON.parse(event.data);
        if (message.type === MessageType.MatchId) {
            matchCallbacks.midReceived(message.payload.mid);
        }
        else if (message.type === MessageType.MatchStart) {
            matchCallbacks.matchStarted();
            gameState.role = message.payload.role;
            let game = runGame(gameState, ws, gameCallbacks);
            game.gameComplete = function() {
                matchCallbacks.matchEnded(ws);
                let messageData = JSON.stringify({
                    type: MessageType.MatchComplete
                });
                ws.send(messageData);
            }
        }
        else if (message.type === MessageType.InputTx) {
            // TODO :Use the input position for the second paddle
        }
        else if (message.type === MessageType.GameStateTx) {
            unpackGameStateMessage(message.payload, gameState);
        }
        else if (message.type == MessageType.MatchComplete) {
            matchCallbacks.matchEnded(ws);
        }
    }
    return matchCallbacks;
}

function hideAllElements() {
    $("#hostJoin").hide();
    $("#loadingIndicator").hide();
    $("#joinEntry").hide();
    $("#hostEntry").hide();
    $("#return").hide();
    $("#hostAddress").hide();
    $("#rematch").hide();
}

function showRematchOptions(inputContext) {
    inputContext.reset();
    $("#interface").show();
    hideAllElements();
    $("#rematch").show();


}

/** Start up the game loop, read input */
function runGame(gameState, connection, callbacks) {
    var gameActive = true;
    callbacks.connectionClosed = function() {
        gameActive = false;
    };

    let gameEvents = {
        gameComplete: function(gameState) {}
    };

    let localGameEvents = {
        gameComplete: function(gameState) {
            gameEvents.gameComplete(gameState);
            gameActive = false;
        }
    }

    let canvas = $("canvas").get(0);

    restoreBallState(gameState, true);
    var inputPosition = new Vector(0, 0);
    document.onmousemove = function(event) {
        let pagePos = new Vector(event.pageX, event.pageY);
        let canvasPos = offsetForCanvas(pagePos, canvas);
        inputPosition.x = canvasPos.x;
        inputPosition.y = canvasPos.y;
    };

    let runLoop = function(time) {
        if (gameActive) {
            gameLoop(gameState, connection, inputPosition, time, localGameEvents);
            window.requestAnimationFrame(runLoop);
        }
    };
    window.requestAnimationFrame(runLoop);
    return gameEvents;
}
