"use strict";

function log(message) {
    var element = document.getElementById("output");
    element.innerText += message;
    element.innerText += "\n";
}

var MessageType = {
    MatchId: 1,
    MatchStart: 2,
    MatchComplete: 3,
    GameStateTx: 4,
    RematchReady: 5,
};

var State = {
    WaitingPlayer: 0,
    GameActive: 1,
    GameEnded: 2
};

var Role = {
    Unassigned: 0,
    Host: 1,
    Client: 2
};

function Vector(x, y) {
    return {
        x: x,
        y: y
    };
}

var Constants = {
    dimensions: Vector(500.0, 360.0),
    initialBallSpeed: 150,
    maxBallSpeed: 500,
    maxReflect: Math.PI / 3.0,
    digitContext: BlockDigit.createContext(40, 80, 10),
    winScore: 10,
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
        ballSpeed: 100,
        score: { a: 0, b: 0 },
        simulateBall: true
    };
}

function updateGameState(gameState, inputs, dt, gameEvents) {
    var dimensions = Constants.dimensions;

    if (gameState.role === Role.Host) {
        // Update the paddle.
        var newPos = inputs.local.y - gameState.paddle1.size.y / 2.0;
        if (newPos <= 2.0) {
            newPos = 2.0;
        }
        else if (newPos > dimensions.y - gameState.paddle1.size.y - 2.0) {
            newPos = dimensions.y - gameState.paddle1.size.y - 2.0;
        }
        gameState.paddle1.position.y = newPos;

        // Update the ball.
        if (gameState.simulateBall) {
            var ball = gameState.ball;
            ball.position.x = ball.position.x + ball.velocity.x * dt;
            ball.position.y = ball.position.y + ball.velocity.y * dt;

            if (ball.velocity.x > 0.0 && collides(ball, gameState.paddle2)) {
                gameState.ballSpeed += 20;
                if (gameState.ballSpeed > Constants.maxBallSpeed) {
                    gameState.ballSpeed = Constants.maxBallSpeed;
                }
                reflect(gameState.paddle2, gameState.ballSpeed, ball, true);
            }

            if (ball.velocity.x < 0.0 && collides(ball, gameState.paddle1)) {
                gameState.ballSpeed += 20;
                if (gameState.ballSpeed > Constants.maxBallSpeed) {
                    gameState.ballSpeed = Constants.maxBallSpeed;
                }
                reflect(gameState.paddle1, gameState.ballSpeed, ball, false);
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
    else {
        // Client updating.
        var newPos = inputs.local.y - gameState.paddle2.size.y / 2.0;
        if (newPos <= 2.0) {
            newPos = 2.0;
        }
        else if (newPos > dimensions.y - gameState.paddle2.size.y - 2.0) {
            newPos = dimensions.y - gameState.paddle2.size.y - 2.0;
        }
        gameState.paddle2.position.y = newPos;

        // Send the gamestate message with just the 2nd paddle position.
    }
}

function reflect(paddle, ballSpeed, ball, left) {
    var maxReflect = Constants.maxReflect;

    var paddleY = paddle.position.y + paddle.size.y / 2.0;
    var ballY = ball.position.y + ball.size.y / 2.0;
    var ratio = (paddleY - ballY) / (paddle.size.y / 2.0);
    
    if (left) {
        ball.position.x = paddle.position.x - ball.size.x;
    }
    else {
        ball.position.x = paddle.position.x + paddle.size.x;
    }

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
    var ballSpeed = Constants.initialBallSpeed;

    var vx = ballSpeed * Math.cos(Math.PI / 4.0);
    var vy = ballSpeed * Math.sin(Math.PI / 4.0);
    gameState.ball.position = Vector(dimensions.x / 2.0, dimensions.y * 0.3);
    gameState.ball.velocity = Vector(left ? -vx : vx, vy);
    gameState.simulateBall = true;
    gameState.ballSpeed = ballSpeed;
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
function buildGameStateMessage(state) {
    return {
        paddle1: state.paddle1.position,
        paddle2: state.paddle2.position,
        ball: state.ball.position,
        score: state.score,
    }
}

/** Load the game state from the network message received */
function applyGameStateMessage(message, state) {
    if (state.role === Role.Client) {
        state.paddle1.position = message.paddle1;
        state.ball.position = message.ball;
        state.score = message.score;
    }
    else {
        state.paddle2.position = message.paddle2;
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
        var midVal = ("0000" + parseInt(mid)).slice(-4);
        $("#loadingIndicator").css("opacity", 0.0);
        $("#hostAddress").text(midVal);
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
function gameLoop(gameState, connection, inputs, dt, gameEvents) {
    updateGameState(gameState, inputs, dt, gameEvents);
    var message = buildGameStateMessage(gameState);
    var messageData = packGameStateMessage(message);
    connection.send(messageData);
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

/**  */
function packMidMessage(message) {
    var buffer = new ArrayBuffer(5);
    var dv = new DataView(buffer);
    dv.setUint8(0, MessageType.MatchId);
    dv.setUint32(1, message.mid);
    return buffer;
}

/** */
function unpackMidMessage(dv) {
    var mid = dv.getUint32(1);
    return {
        mid: mid
    }
}

/**  */
function packMatchStartMessage(message) {
    var buffer = new ArrayBuffer(2);
    var dv = new DataView(buffer);
    dv.setUint8(0, MessageType.MatchStart);
    dv.setUint8(1, message.role);
    return buffer;
}

/** */
function unpackMatchStartMessage(dv) {
    var role = dv.getUint8(1);
    return {
        role: role
    }
}

/**  */
function packGameStateMessage(message) {
    var buffer = new ArrayBuffer(8 * 3 + 3);
    var dv = new DataView(buffer);

    var offset = 0;
    dv.setUint8(offset, MessageType.GameStateTx); offset += 1;
    dv.setFloat32(offset, message.paddle1.x); offset += 4;
    dv.setFloat32(offset, message.paddle1.y); offset += 4;
    dv.setFloat32(offset, message.paddle2.x); offset += 4;
    dv.setFloat32(offset, message.paddle2.y); offset += 4;
    dv.setFloat32(offset, message.ball.x); offset += 4;
    dv.setFloat32(offset, message.ball.y); offset += 4;
    dv.setUint8(offset, message.score.a); offset += 1;
    dv.setUint8(offset, message.score.b); offset += 1;

    return buffer;
}

/**  */
function unpackGameStateMessage(dv) {
    var paddle1 = { x: 0.0, y: 0.0 };
    var paddle2 = { x: 0.0, y: 0.0 };
    var ball = { x: 0.0, y: 0.0 };
    var score = { a: 0, b: 0 };

    var offset = 1;
    paddle1.x = dv.getFloat32(offset); offset += 4;
    paddle1.y = dv.getFloat32(offset); offset += 4;
    paddle2.x = dv.getFloat32(offset); offset += 4;
    paddle2.y = dv.getFloat32(offset); offset += 4;
    ball.x = dv.getFloat32(offset); offset += 4;
    ball.y = dv.getFloat32(offset); offset += 4;
    score.a = dv.getUint8(offset); offset += 1;
    score.b = dv.getUint8(offset); offset += 1;

    return {
        paddle1: paddle1,
        paddle2: paddle2,
        ball: ball,
        score: score
    }
}

/**  */
function packMatchCompleteMessage() {
    var buffer = new ArrayBuffer(1);
    var dv = new DataView(buffer);
    dv.setUint8(0, MessageType.MatchComplete);
    return buffer;
}

/**  */
function unpackRematchMessage(dv) {
    var ready = dv.getUint8(1);
    return {
        ready: ready
    }
}

/**  */
function packRematchMessage(message) {
    var buffer = new ArrayBuffer(2);
    var dv = new DataView(buffer);
    dv.setUint8(0, MessageType.RematchReady);
    dv.setUint8(1, message.ready);
    return buffer;
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
        connectionClosed: function() {},
        remoteInputUpdated: function() {}
    };

    var readyForStart = ws != null;
    if (ws == null) {
        var loc = window.location
        var gameUrl = "ws:";
        gameUrl += "//" + loc.host;
        gameUrl += loc.pathname + "sock";
        alert(gameUrl);
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
            var messageData = packMatchCompleteMessage();
            ws.send(messageData);
        }
    }

    var hasError = false;
    ws.onerror = function(err) {
        hasError = true;
    }
    ws.onopen = function() {
    }
    ws.onclose = function(err) {
        if (hasError) {
            matchCallbacks.connectionError();
        }
        matchCallbacks.connectionClosed();
        gameCallbacks.connectionClosed();
    }
    ws.onmessage = function(event) {
        var reader = new FileReader();
        reader.onload = function() {
            var dataView = new DataView(reader.result);
            var messageType = dataView.getUint8(0);
            if (messageType === MessageType.MatchId) {
                var message = unpackMidMessage(dataView);
                matchCallbacks.midReceived(message.mid);
            }
            else if (messageType === MessageType.MatchStart) {
                var message = unpackMatchStartMessage(dataView);
                gameState.role = message.role;
                startMatch();
            }
            else if (messageType === MessageType.GameStateTx) {
                var message = unpackGameStateMessage(dataView);
                applyGameStateMessage(message, gameState);
            }
            else if (messageType == MessageType.MatchComplete) {
                matchCallbacks.matchEnded({connection: ws, role: gameState.role});
            }
        }
        reader.readAsArrayBuffer(event.data);
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
                role: Role.Client
            }
            var messageData = packMatchStartMessage(startMessage);
            context.connection.send(messageData);
            $("#interface").hide();
        }
    };

    $("#rematchReadyButton").show();
    $("#rematchSelfReady").text("");
    inputContext.rematchReadyPressed = function() {
        ready = true;
        var readyMessage = {
            ready: ready
        };

        if (ready) {
            $("#rematchReadyButton").hide();
            $("#rematchSelfReady").text("Ready for match, waiting for opponent...");
        }
        var messageData = packRematchMessage(readyMessage);
        context.connection.send(messageData);
        evaluateStart();
    };

    var notReadyMessageOpponent = "Opponent Not Yet Ready";
    var readyMessageOpponent = "Opponent Ready";
    $("#rematchOpponentReady").text(notReadyMessageOpponent);
    context.connection.onmessage = function(event) {
        var reader = new FileReader();
        reader.onload = function() {
            var dataView = new DataView(reader.result);
            var messageType = dataView.getUint8(0);
            if (messageType === MessageType.RematchReady) {
                var rematch = unpackRematchMessage(dataView);
                if (rematch) {
                    opponentReady = true;
                    $("#rematchOpponentReady").text(readyMessageOpponent);
                } else {
                    opponentReady = false;
                    $("#rematchOpponentReady").text(notReadyMessageOpponent);
                }
                evaluateStart();
            }
            else if (messageType === MessageType.MatchStart) {
                // If the client receives the match start, kick off the new match.
                joinMatch("existing", inputContext, context.connection);
                $("#interface").hide();
            }
        }
        reader.readAsArrayBuffer(event.data);
    };
}

/** Start up the game loop, read input */
function runGame(gameState, connection, callbacks) {
    var gameActive = true;
    callbacks.connectionClosed = function() {
        gameActive = false;
    };

    var inputs = {
        remote: Vector(0, 0),
        local: Vector(0, 0)
    };

    callbacks.remoteInputUpdated = function(input) {
        inputs.remote = input;
    };

    var gameEvents = {
        gameComplete: function() {}
    };

    var localGameEvents = {
        gameComplete: function(gameState) {
            gameEvents.gameComplete(gameState);
            gameActive = false;
        }
    };

    var canvas = $("canvas").get(0);

    restoreBallState(gameState, true);
    document.onmousemove = function(event) {
        var pagePos = Vector(event.pageX, event.pageY);
        inputs.local = offsetForCanvas(pagePos, canvas);
    };

    var gameInterval = 33.33;
    var runLoop = function() {
        if (gameActive) {
            gameLoop(gameState, connection, inputs, gameInterval / 1000.0, localGameEvents);
        }
    };
    var interval = window.setInterval(runLoop, gameInterval);

    var renderLoop = function(time) {
        if (gameActive) {
            drawGame(gameState);
            window.requestAnimationFrame(renderLoop);
        }
        else {
            clearInterval(interval);
        }
    };
    window.requestAnimationFrame(renderLoop);

    return gameEvents;
}
