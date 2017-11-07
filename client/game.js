"use strict";

function log(message) {
    var element = document.getElementById("output");
    element.innerText += message;
    element.innerText += "\n";
}

var MessageType = {
    MatchId: "MatchId",
    MatchStart: "MatchStart",
    MatchComplete: "MatchComplete",
    InputTx: "InputTx",
    GameStateTx: "GameStateTx",
    RematchReady: "RematchReady",
};

var State = {
    WaitingPlayer: 0,
    GameActive: 1,
    GameEnded: 2
};

var Role = {
    Unassigned: "Unassigned",
    Host: "Host",
    Client: "Client"
};

function Vector(x, y) {
    return {
        x: x,
        y: y
    };
}

var Constants = {
    dimensions: Vector(500.0, 360.0),
    ballSpeed: 50,
    maxReflect: Math.PI / 3.0,
    digitContext: BlockDigit.createContext(40, 80, 10),
    winScore: 1,
    midAttr: "mid"
}

function GameObject(position, velocity, size) {
    return {
        position: position ? position : Vector(0, 0),
        velocity: velocity ? velocity : Vector(0, 0),
        size: size ? size : Vector(0, 0)
    };
}

function GameState(role, state) {
    return {
        role: role,
        state: state,
        paddle1: GameObject(Vector(10, 80), Vector(0, 0), Vector(10, 50)),
        paddle2: GameObject(Vector(Constants.dimensions.x - 16, 130), Vector(0, 0), Vector(10, 50)),
        ball: GameObject(Vector(0, 0), Vector(0.0, 0.0), Vector(10, 10)),
        score: { a: 0, b: 0 },
        simulateBall: true
    };
}

function updateGameState(gameState, inputPosition, dt, gameEvents) {
    var dimensions = Constants.dimensions;

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
    var maxReflect = Constants.maxReflect;
    var ballSpeed = Constants.ballSpeed;

    var paddleY = paddle.position.y + paddle.size.y / 2.0;
    var ballY = ball.position.y + ball.size.y / 2.0;
    var ratio = (paddleY - ballY) / (paddle.size.y / 2.0);

    var reflectAngle = maxReflect * Math.abs(ratio);
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
    var dimensions = Constants.dimensions;
    var ballSpeed = Constants.ballSpeed;

    var vx = ballSpeed * Math.cos(Math.PI / 4.0);
    var vy = ballSpeed * Math.sin(Math.PI / 4.0);
    gameState.ball.position = Vector(dimensions.x / 2.0, dimensions.y * 0.3);
    gameState.ball.velocity = Vector(left ? -vx : vx, vy);
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
    var topOffset = canvas.offsetTop;
    var leftOffset = canvas.offsetLeft;
    return Vector(position.x - leftOffset, position.y - topOffset);
}

/** Read 'mid' off of the active url */
function getUrlMatchId() {
    var params = window.location.search.substring(1).split(new RegExp("=|\\&"));
    var mid = null;
    for (var i = 0; i < params.length - 1; i++) {
        if (params[i] === Constants.midAttr) {
            mid = params[i + 1];
            break;
        }
    }
    return mid;
}

/** Draw the current game state */
function drawGame(gameState) {
    var dimensions = Constants.dimensions;
    var context = $("#canvas").get(0).getContext("2d");
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
        var mid = $("#matchInput").val();
        if (mid.length == 4) {
            joinMatch(mid, inputContext);
        } else {
            $("#joinMessaging").text("");
        }
    }
}

function hostMatch(inputContext, connection) {
    var indicatorState = startLoadingIndicator();
    var errorFirst = false;

    var match = runMatch(null, inputContext, connection);
    match.midReceived = function(mid) {
        $("#loadingIndicator").css("opacity", 0.0);
        $("#hostAddress").text(mid);
        $("#hostAddress").show();
        stopLoadingIndicator(indicatorState);
    };

    match.matchStarted = function() {
        $("#interface").hide();
    }

    match.matchEnded = function(context) {
        showRematchOptions(inputContext, context);
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

function joinMatch(mid, inputContext, connection) {
    var indicatorState = startLoadingIndicator();
    var errorFirst = false;

    var match = runMatch(mid, inputContext, connection);
    match.matchStarted = function() {
        $("#interface").hide();
        stopLoadingIndicator(indicatorState);
    }

    match.matchEnded = function(context) {
        showRematchOptions(inputContext, context);
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
    var element =  $("#loadingIndicator");
    element.show();
    var interval = 400;
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
    var message = null;
    var messageData = null;
    if (gameState.role == Role.Host) {
        updateGameState(gameState, inputPosition, 0.04, gameEvents);
        message = packGameStateMessage(gameState);
        messageData = JSON.stringify(message);
        connection.send(messageData);
    }
    else {
        message = packInputMessage(inputPosition);
        messageData = JSON.stringify(message);
        connection.send(messageData);
    }
    drawGame(gameState);
}

function setupInputContext() {
    var inputContext = {
        reset: function() {
            inputContext.returnPressed = function() {};
            inputContext.joinPressed =  function() {};
            inputContext.hostPressed =  function() {};
            inputContext.matchInputChanged =  function() {};
            inputContext.rematchReadyPressed = function() {};
        }
    }
    inputContext.reset();
    $("#returnButton").click(function() { inputContext.returnPressed(); });
    $("#joinButton").click(function() { inputContext.joinPressed(); });
    $("#hostButton").click(function() { inputContext.hostPressed(); });
    $("#rematchReadyButton").click(function() { inputContext.rematchReadyPressed(); });
    $("#matchInput").keyup(function() { inputContext.matchInputChanged(); });
    return inputContext;
}

/** Entry point from document.onload */
function startup() {
    var inputContext = setupInputContext();

    $("#interface").hide();
    // Either start a hosted match, or provide the option to host or enter a match code.
    // Evaluate the url parameter here, it could have been provided to jumpstart the match.
    var mid = getUrlMatchId()
    if (mid === null) {
        runMenu(inputContext);
    } else {
        joinMatch(mid, inputContext);
    }
}

/** Initialize comms, establish the role of this instance of the game, and kick off the match */
function runMatch(mid, inputContext, ws) {
    // Callbacks to the match UI.
    var matchCallbacks = {
        midReceived: function() {},
        matchStarted: function() {},
        matchEnded: function() {},
        connectionError: function() {},
        connectionClosed: function() {}
    };

    // Callbacks to the running game.
    var gameCallbacks = {
        connectionClosed: function() {}
    };

    var readyForStart = ws != null;
    if (ws == null) {
        var gameUrl = "ws://localhost:8080";
        if (mid != null) {
            gameUrl = gameUrl + "?" + Constants.midAttr + "=" + mid;
        }
        ws = new WebSocket(gameUrl);
    }

    var gameState = GameState(Role.Unassigned, State.WaitingPlayer);
    gameState.role = (mid == null) ? Role.Host : Role.Client;

    var startMatch = function() {
        matchCallbacks.matchStarted();
        var game = runGame(gameState, ws, gameCallbacks);
        game.gameComplete = function() {
            matchCallbacks.matchEnded({connection: ws, role: gameState.role});
            var messageData = JSON.stringify({
                type: MessageType.MatchComplete
            });
            ws.send(messageData);
        }
    }

    ws.onerror = function() {
        matchCallbacks.connectionError();
        gameCallbacks.connectionClosed();
    }
    ws.onopen = function() {
    }
    ws.onclose = function() {
        matchCallbacks.connectionClosed();
        gameCallbacks.connectionClosed();
    }
    ws.onmessage = function(event) {
        // log("rx: " + event.data);
        var message = JSON.parse(event.data);
        if (message.type === MessageType.MatchId) {
            matchCallbacks.midReceived(message.payload.mid);
        }
        else if (message.type === MessageType.MatchStart) {
            gameState.role = message.payload.role;
            startMatch();
        }
        else if (message.type === MessageType.InputTx) {
            // TODO :Use the input position for the second paddle
        }
        else if (message.type === MessageType.GameStateTx) {
            unpackGameStateMessage(message.payload, gameState);
        }
        else if (message.type == MessageType.MatchComplete) {
            matchCallbacks.matchEnded({connection: ws, role: gameState.role});
        }
    }

    if (readyForStart) {
        startMatch();
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

function showRematchOptions(inputContext, context) {
    inputContext.reset();
    $("#interface").show();
    hideAllElements();
    $("#rematch").show();

    var ready = false;
    var opponentReady = false;

    var evaluateStart = function() {
        if (context.role === Role.Host && ready && opponentReady) {
            // Start the match off.
            hostMatch(inputContext, context.connection);
            var startMessage = {
                type: MessageType.MatchStart,
                payload: {
                    role: "Client"
                }
            }
            var messageData = JSON.stringify(startMessage);
            context.connection.send(messageData);
            $("#interface").hide();
        }
    };

    inputContext.rematchReadyPressed = function() {
        ready = !ready;
        var readyMessage = {
            type: MessageType.RematchReady,
            ready: ready
        };
        var messageData = JSON.stringify(readyMessage);
        context.connection.send(messageData);
        evaluateStart();
    };

    var notReadyMessage = "Opponent Not Yet Ready";
    var readyMessage = "Opponent Ready";
    $("#rematchOpponentReady").text(notReadyMessage);
    context.connection.onmessage = function(event) {
        var message = JSON.parse(event.data);
        if (message.type === MessageType.RematchReady) {
            if (message.ready) {
                opponentReady = true;
                $("#rematchOpponentReady").text(readyMessage);
            } else {
                opponentReady = false;
                $("#rematchOpponentReady").text(notReadyMessage);
            }
            evaluateStart();
        }
        else if (message.type === MessageType.MatchStart) {
            // If the client receives the match start, kick off the new match.
            joinMatch("existing", inputContext, context.connection);
            $("#interface").hide();
        }
    };
}

/** Start up the game loop, read input */
function runGame(gameState, connection, callbacks) {
    var gameActive = true;
    callbacks.connectionClosed = function() {
        gameActive = false;
    };

    var gameEvents = {
        gameComplete: function() {}
    };

    var localGameEvents = {
        gameComplete: function(gameState) {
            gameEvents.gameComplete(gameState);
            gameActive = false;
        }
    }

    var canvas = $("canvas").get(0);

    restoreBallState(gameState, true);
    var inputPosition = Vector(0, 0);
    document.onmousemove = function(event) {
        var pagePos = Vector(event.pageX, event.pageY);
        var canvasPos = offsetForCanvas(pagePos, canvas);
        inputPosition.x = canvasPos.x;
        inputPosition.y = canvasPos.y;
    };

    var runLoop = function(time) {
        if (gameActive) {
            gameLoop(gameState, connection, inputPosition, time, localGameEvents);
            window.requestAnimationFrame(runLoop);
        }
    };
    window.requestAnimationFrame(runLoop);
    return gameEvents;
}
