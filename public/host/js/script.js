var ROLE = "host";

var currentRoom = 0;
var roomState = {
    code: 0,
    state: "",
    players: [],
    grid: []
};
var blankState = {
    code: 0,
    state: "",
    players: [],
    grid: []
};
var currentSocket = null;
var firstUpdate = true;
var playerProgressMade = false;
var animatedSurveyComplete = false;
var simulationPrepared = false;
var simReady = false;
var autoAdvance = false;
var autoIntervalID = -1;

$(function () {
    // Establish connection with the server
    var socket = io();
    currentSocket = socket;
    // Listen for messages
    socket.on("room-check-passed", function (room) {
        // Room check passed, become host of that room
        console.log("Room is OK");
        currentRoom = room.code;
        roomState = room;
        updateState(room);
        $("#roomCodeText").text(currentRoom);
    });
    socket.on("room-check-failed", function (room) {
        // Room check failed, need to create a new room
        console.log("Room check failed");
        socket.emit("create-room");
    });
    socket.on("room-created", function (code) {
        console.log("Created room at " + code);
        currentRoom = code;
        $("#roomCodeText").text(code);
        // Save this info to local storage
        var hostData = {
            "roomCode": currentRoom
        };
        localStorage.setItem("cipd-host", JSON.stringify(hostData));
    });
    // Received whenever the server says there's a new state update available
    socket.on("state-update-available", function (code) {
        console.log("Found update for room " + code);
        if (code == currentRoom) {
            socket.emit("request-state-update", code);
        }
    });
    // Received state update
    socket.on("state-update", function (newState) {
        updateState(newState);
    });
    // Received simulation update
    socket.on("sim-update", function (roomCode, iterations) {
        updateSim(iterations);
    });
    // Kicked from room
    socket.on("kicked-from-room", function (roomCode) {
        if (roomState.code == roomCode) {
            socket.emit("create-room");
        }
    });
    // See if a room has already been made in this browser
    var hostData = JSON.parse(localStorage.getItem("cipd-host"));
    console.log(hostData);
    if (hostData == null) {
        // No room code stored, so get a new one
        console.log("Host data is null, creating new room");
        socket.emit("create-room");
    } else if (hostData.roomCode != null) {
        // There is a room code stored; check to see if it's OK
        console.log("Checking to see if room code is OK");
        socket.emit("login-room-check", hostData.roomCode);
    }
    $("#addAIButton").click(function() {
        console.log(roomState);
        console.log("add random player", roomState.code);
        socket.emit("add-CPU-player", {"roomCode":roomState.code});
    });
    $("#addBasicButton").click(function() {
        console.log(roomState);

        [...Array(8).keys()].forEach(i=>{
        var binString= Number(i+8).toString(2).slice(1);
        var binArray=binString.split("").map(i=>i*100);
        console.log("add random player", roomState.code);
        console.log(binString,binArray)
        socket.emit("add-CPU-player", {"roomCode":roomState.code,"strat":binArray,"name": binString});
    })
    });

    $("#roomResetButton").click(function () {
        // Reset room
        resetRoom();
    });
    $("#roomStartButton").click(function () {
        // Start room
        startGame();
    });
    $("#resultsMenuButton").click(function () {
        // End game
        endGame();
    });
    $("body").click(function () {
        if (animatedSurveyComplete && !simulationPrepared) {
            simulationPrepared = true;
            prepareSimulation();
        }
        if (simReady) {
            advanceSim();
        }
    });
    $("#simAutoBox").click(function (evt) {
        evt.stopPropagation();
        autoAdvance = !autoAdvance;
        $("#simAutoCheckbox").css("background-image", "url(../resources/img/checkbox_" + (autoAdvance ? "on" : "off") + ".svg)");
        if (autoAdvance) {
            autoIntervalID = setInterval(advanceSim, 250);
        } else {
            clearInterval(autoIntervalID);
            autoIntervalID = -1;
        }
    });
    $("#simExit").hover(function (evt) {
        $("#simExitText").animate({
            opacity: 1
        }, 100);
    }, function (evt) {
        $("#simExitText").animate({
            opacity: 0
        }, 100);
    });
    $("#simExit").click(function() {
        finishSimulation(true);
    });
    makeSimCells();
    makeSimScores();
});

function advanceSim() {
    if (roomState.state == "sim") {
        currentSocket.emit("advance-simulation", roomState.code);
    } else {
        clearInterval(autoIntervalID);
        autoIntervalID = -1;
    }
}

function updateState(newState) {
    var oldState = roomState;
    roomState = newState;
    console.log(roomState);
    if (roomState.state == "prep") {
        updatePlayerList();
    } else if (roomState.state == "survey") {
        if (!playerProgressMade) {
            createPlayerProgress();
            playerProgressMade = true;
        }
        updatePlayerProgress();
    } else if (roomState.state == "sim") {
        updateSimulation();
    } else if (roomState.state == "results") {
        updateResults();
    }
    // Fade screens in and out
    if ((roomState.state != oldState.state) || firstUpdate) {
        $(".screenBox").removeClass("anim_fadeIn");
        $(".screenBox").addClass("anim_fadeOut");
        setTimeout(function () {
            $(".screenBox").css("visibility", "hidden");
            $(".display-" + roomState.state).css("visibility", "visible");
            $(".display-" + roomState.state).removeClass("anim_fadeOut");
            $(".display-" + roomState.state).addClass("anim_fadeIn");
        }, 250);
    }
    if (firstUpdate) {
        firstUpdate = false;
    }
}

function updatePlayerList() {
    var players = roomState.players;
    $("#titlePlayerList").empty();
    for (var i = 0; i < players.length; i++) {
        $("#titlePlayerList").append('<div id="titlePlayerInfo' + i + '" class="titlePlayerInfo"></div>');
        $("#titlePlayerInfo" + i).append('<div id="titlePlayerName' + i + '" class="titlePlayerName">' + players[i].name + '</div>');
        var c = "#404040";
        if (i % 2 == 1) {
            c = "#808080";
        }
        $("#titlePlayerInfo" + i).css("background-color", c);
    }
}

function createPlayerProgress() {
    var players = roomState.players;
    $("#surveyProgressBoxes").empty();
    for (var i = 0; i < players.length; i++) {
        $("#surveyProgressBoxes").append('<div id="surveyBox' + i + '" class="surveyBox"></div>');
        $("#surveyBox" + i).append('<div id="surveyName' + i + '" class="surveyName"></div>');
        $("#surveyBox" + i).append('<div id="surveyQuestions' + i + '" class="surveyQuestions"></div>');
        for (var j = 0; j < 6; j++) {
            $("#surveyQuestions" + i).append('<div id="surveyQuestionBubble' + i + '-' + j + '" class="surveyQuestionBubble"></div>');
            $("#surveyQuestionBubble" + i + "-" + j).append('<div class="surveyQuestionCheck"></div>')
            var left = 45 + 15 * (j - 2.5);
            $("#surveyQuestionBubble" + i + "-" + j).css("left", left + "%");
        }
        $("#surveyBox" + i).append('<div id="surveyProfile' + i + '" class="surveyProfile">(??/??/??)</div>');
        $("#surveyBox" + i).css("top", (10 * i) + "%");
    }
}

function updatePlayerProgress() {
    var players = roomState.players;
    var surveyDone = true;
    for (var i = 0; i < players.length; i++) {
        $("#surveyName" + i).text(players[i].name);
        for (var j = 0; j < 6; j++) {
            if (j < players[i].answers.length) {
                $("#surveyQuestionBubble" + i + "-" + j).addClass("anim_bubbleComplete");
            } else {
                surveyDone = false;
            }
        }
    }
    if (surveyDone && !animatedSurveyComplete) {
        animatedSurveyComplete = true;
        animateSurveyComplete();
    }
}

function animateSurveyComplete() {
    var players = roomState.players;
    $("#surveyHeaderText").text("SURVEY IN PROGRESS");
    $("#surveyHeaderText").removeClass("anim_fadeIn");
    $("#surveyHeaderText").addClass("anim_fadeOut");
    $(".surveyProfile").removeClass("anim_fadeIn");
    $(".surveyProfile").addClass("anim_fadeOut");
    setTimeout(function () {
        $("#surveyHeaderText").text("SURVEY COMPLETE");
        $("#surveyHeaderText").removeClass("anim_fadeOut");
        $("#surveyHeaderText").addClass("anim_fadeIn");
        $(".surveyProfile").removeClass("anim_fadeOut");
        $(".surveyProfile").addClass("anim_fadeIn");
        $("#surveyContinueText").addClass("anim_fadeIn");
        for (var i = 0; i < players.length; i++) {
            var prof = players[i].profile;
            var profileStr = "(" + prof[0] + "/" + prof[1] + "/" + prof[2] + ")";
            $("#surveyProfile" + i).text(profileStr);
        }
    }, 250);
}

function resetRoom() {
    currentSocket.emit("reset-room", currentRoom);
}

function startGame() {
    playerProgressMade = false;
    animatedSurveyComplete = false;
    simulationPrepared = false;
    simReady = false;
    iterationsRun = 0;
    payoffTable = [];
    localGrid = [];
    cellCounts = [];
    autoAdvance = false;
    $("#simAutoCheckbox").css("background-image", "url(../resources/img/checkbox_off.svg)");
    $("#surveyHeaderText").text("SURVEY IN PROGRESS");
    $("#surveyContinueText").removeClass("anim_fadeIn");
    currentSocket.emit("start-game", currentRoom);
}

function endGame() {
    currentSocket.emit("end-game", currentRoom);
}

function prepareSimulation() {
    currentSocket.emit("prepare-simulation", currentRoom);
}

function makeSimScores() {
    $("#simScores").empty();
    var toAppend = "";
    for (var i = 0; i < 10; i++) {
        toAppend += '<div id="simScore' + i + '" class="simScore"><div id="simScoreColor' + i + '" class="simScoreColor"></div><div id="simScoreName' + i + '" class="simScoreName">Jim</div><div id="simScoreProfile' + i + '" class="simScoreProfile">(100/100/100)</div><div id="simScoreRank' + i + '" class="simScoreRank">' + (i + 1) + '</div><div id="simScoreCount' + i + '" class="simScoreCount">2500</div></div>';
    }
    $("#simScores").append(toAppend);
    for (var i = 0; i < 10; i++) {
        $("#simScore" + i).css("top", (10 * i) + "%");
    }
}

function updateResults() {
    $("#resultsWinnerName").text(roomState.players[roomState.winner].name);
    $("#resultsWinnerProfile").text(getProfileString(roomState.players[roomState.winner].profile));
    $("#resultsIterations").text("COMPLETED IN " + roomState.iterations + " ITERATIONS");
}
