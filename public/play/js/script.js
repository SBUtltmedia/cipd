var ROLE = "client";

var playerData = {};
var roomState = {
    code: 0,
    state: "prep",
    players: []
};

var firstUpdate = true;

var mouseDown = false;
var sliderValue = 50;

var currentSocket = null;

var lastQuestion = -1;

var questions = [
    {
        questionText: "Even if I didn’t know you, I would initially cooperate with you",
        choiceLeft: "Disagree",
        choiceRight: "Agree"
    },
    {
        questionText: "If you cooperated with me last time we met, then I will cooperated with you this time",
        choiceLeft: "Never",
        choiceRight: "Always"
    },
    {
        questionText: "Even if you didn't cooperate with me last time, I'll still cooperate with you this time",
        choiceLeft: "Never",
        choiceRight: "Always"
    },
    {
        questionText: "I don't trust people I don't know",
        choiceLeft: "Agree",
        choiceRight: "Disagree"
    },
    {
        questionText: "Even though you cooperated with me last time, I'm not going to cooperate with you this time",
        choiceLeft: "Always",
        choiceRight: "Never"
    },
    {
        questionText: "If you were not trustworthy last time, I'm not going to trust you this time",
        choiceLeft: "Always",
        choiceRight: "Never"
    }
];

$(function () {
    // Establish connection with the server
    var socket = io();
    currentSocket = socket;
    // Listen for messages
    socket.on("join-room-accepted", function (p) {
        console.log(p);
        playerData = p;
        savePlayerData();
        playConnectedAnimation();
    });
    socket.on("player-check-passed", function (p, newState) {
        // Already logged in; fill in fields
        console.log("Logged in successfully");
        playerData = p;
        savePlayerData();
        $("#nameInputInput").val(playerData.name);
        $("#codeInputInput").val(playerData.roomCode);
        playConnectedAnimation();
        updateState(newState);
    });
    socket.on("player-check-failed", function () {
        // Can't log in
        console.log("Player check failed");
        playDisconnectedAnimation();
        updateState(roomState);
    });
    socket.on("update-room-members", function (roomCode) {
        if (playerData != null) {
            if (playerData.roomCode == roomCode) {
                console.log("Checking to see if room code is OK");
                socket.emit("login-player-check", playerData.roomCode, playerData.id);
            }
        }
    });
    // Received whenever the server says there's a new state update available
    socket.on("state-update-available", function (code) {
        if (playerData != null) {
            console.log("Found update for room " + code + ", my code is " + playerData.roomCode);
            if (code == playerData.roomCode) {
                console.log("Accepted update for room " + code);
                socket.emit("request-state-update", code);
            }
        }
    });
    // Received state update
    socket.on("state-update", function (newState) {
        console.log("Received state update");
        updateState(newState);
    });
    // Received simulation update
    socket.on("sim-update", function (roomCode, iterations) {
        if (playerData != null) {
            if (roomCode == playerData.roomCode) {
                updateSim(iterations);
            }
        }
    });
    // Kicked from room
    socket.on("kicked-from-room", function (roomCode) {
        console.log("Kicked from room");
        if (roomState.code == roomCode) {
            roomState = {
                code: 0,
                state: "prep",
                players: []
            };
            firstUpdate = true;
            localStorage.setItem("cipd-play", null);
            initialLogin();
        }
    });
    // Try to join a room when the Submit button is clicked (title screen)
    $("#titleOKButton").click(function () {
        var name = $("#nameInputInput").val();
        var code = parseInt($("#codeInputInput").val());
        if (name != "" && !isNaN(code)) {
            socket.emit("join-room", code, name);
        }
        console.log(code);
    });
    makeSurveyBubbles();
    makeProfileBoxes();
    makeSimCells();
    $(window).mousedown(function () {
        mouseDown = true;
    });
    $(window).mouseup(function () {
        mouseDown = false;
    });
    $("#surveySliderBox").mousedown(function (evt) {
        var pct = (evt.pageX - $("#surveySliderBox").offset().left) / $("#surveySliderBox").width();
        updateSlider(pct);
    });
    $("#surveySliderBox").mousemove(function (evt) {
        if (mouseDown) {
            var pct = (evt.pageX - $("#surveySliderBox").offset().left) / $("#surveySliderBox").width();
            updateSlider(pct);
        }
    });
    $("#surveyOKButton").click(function () {
        submitAnswer();
    });

    initialLogin();
});

function initialLogin() {
    // Login: check if already joined a room
    // See if a room has already been made in this browser
    playerData = JSON.parse(localStorage.getItem("cipd-play"));
    console.log(playerData);
    if (playerData == null) {
        // No data yet; do nothing
        console.log("No data detected");
        $("#blocker").css("visibility", "hidden");
        $("#nameInputInput").val("");
        $("#codeInputInput").val("");
        playDisconnectedAnimation();
        hideProfile();
        payoffTable = [];
        updateState(roomState);
    } else if (playerData.roomCode != null) {
        // Player has already joined, check to see if still OK
        console.log("Checking to see if room code is OK");
        currentSocket.emit("login-player-check", playerData.roomCode, playerData.id);
    }
}

function playConnectedAnimation() {
    $("#blocker").css("visibility", "visible");
    $("#titleOKButton").removeClass("anim_fadeIn");
    $("#titleOKButton").addClass("anim_fadeOut");
    setTimeout(function () {
        $("#titleSubmittedBox").removeClass("anim_fadeOut");
        $("#titleSubmittedBox").addClass("anim_fadeIn");
    }, 250);
}

function playDisconnectedAnimation() {
    $("#blocker").css("visibility", "hidden");
    $("#titleOKButton").removeClass("anim_fadeOut");
    $("#titleSubmittedBox").removeClass("anim_fadeIn");
}

function updateState(newState) {
    var oldState = roomState;
    roomState = newState;
    console.log(roomState);
    if (roomState.state == "prep") {
        console.log("Prep");
    } else if (roomState.state == "survey") {
        console.log("Survey");
        $("#blocker").css("visibility", "hidden");
        if (playerData.answers.length != lastQuestion) {
            lastQuestion = playerData.answers.length;
            if (playerData.answers.length < 6) {
                setQuestion(playerData.answers.length);
            } else {
                showProfile();
            }
        }
    } else if (roomState.state == "sim") {
        if (payoffTable.length == 0) {
            iterationsRun = 0;
            makePayoffTable();
            setLocalGrid();
            simReady = true;
        }
        if (simReady) {
            updateSimulation();
        }
    } else if (roomState.state == "results") {
        if (roomState.winner == playerData.num) {
            $("#resultsWinText").text("VICTORY");
            $("#resultsWinSubtext").text("CONGRATULATIONS!");
        } else {
            $("#resultsWinText").text("DEFEAT");
            var iter = playerData.iterationsSurvived;
            $("#resultsWinSubtext").text("SURVIVED " + iter + " ITERATION" + (iter == 1 ? "" : "S"));
        }
    }
    // Fade screens in and out
    console.log(roomState.state, oldState.state);
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

function makeSurveyBubbles() {
    var toAppend = "";
    for (var i = 1; i <= 6; i++) {
        toAppend += '<div id="surveyHeaderBubble' + i + '" class="surveyHeaderBubble"><div id="surveyHeaderBubbleText' + i + '" class="surveyHeaderBubbleText">' + i + '</div></div>';
    }
    $("#surveyHeader").append(toAppend);
    for (var i = 1; i <= 6; i++) {
        var left = 44.4445 + 15 * (i - 3.5);
        $("#surveyHeaderBubble" + i).css("left", left + "%");
    }
}

function makeProfileBoxes() {
    var toAppend = "";
    var text = ["INITIAL MOVE", "REPLY: COOPERATION", "REPLY: DEFECTION"];
    for (var i = 0; i < 3; i++) {
        toAppend += '<div id="profileStatBox' + i + '" class="profileStatBox"><div id="profileStatTitle' + i + '" class="profileStatTitle">' + text[i] + '</div><div id="profileStatSlider' + i + '" class="profileStatSlider"><div id="profileSliderBubble' + i + '" class="profileSliderBubble"><div id="profileSliderText' + i + '" class="profileSliderText">0</div></div></div><div id="profileSliderBar' + i + '" class="profileSliderBar"><div id="profileSliderFill' + i + '" class="profileSliderFill"></div></div></div>';
    }
    $("#profileBox").append(toAppend);
    for (var i = 0; i < 3; i++) {
        var top = 15 + 25 * i;
        $("#profileStatBox" + i).css("top", top + "%");
    }
}

function setQuestion(id) {
    $("#surveyHeaderText").text("QUESTION " + (id + 1) + "/6");
    $("#surveyQuestionText").text(questions[id].questionText);
    $("#surveyChoiceTextLeft").text(questions[id].choiceLeft);
    $("#surveyChoiceTextRight").text(questions[id].choiceRight);
    updateSlider(.5);
    for (var i = 1; i <= 6; i++) {
        if (i == id + 1) {
            $("#surveyHeaderBubble" + i).removeClass("anim_headerBubbleOut");
            $("#surveyHeaderBubble" + i).addClass("anim_headerBubbleIn");
        } else {
            $("#surveyHeaderBubble" + i).removeClass("anim_headerBubbleIn");
            $("#surveyHeaderBubble" + i).addClass("anim_headerBubbleOut");
        }
    }
}

function updateSlider(pct) {
    var BUFFER = .075;
    var realPct = 0;
    if (pct < BUFFER) {
        realPct = 0;
    } else if (pct > 1 - BUFFER) {
        realPct = 1;
    } else {
        realPct = (pct - BUFFER) / (1 - 2 * BUFFER);
    }
    var bubblePos = (1 - 2 * BUFFER) * realPct * 100;
    var bubbleText = Math.round(100 * realPct);
    var barWidth = 100 * realPct;
    sliderValue = bubbleText;
    $("#surveySlider").css("left", bubblePos + "%");
    $("#surveySliderText").text(bubbleText);
    $("#surveySliderFill").css("width", barWidth + "%");
}

function submitAnswer() {
    playerData.answers.push(sliderValue);
    if (playerData.answers.length < 6) {
        setQuestion(playerData.answers.length);
    } else {
        computeProfile();
        showProfile();
    }
    savePlayerData();
    currentSocket.emit("answer-submit", playerData);
}

function computeProfile() {
    for (var i = 0; i < 3; i++) {
        playerData.profile[i] = Math.round((playerData.answers[i] + playerData.answers[i + 3]) / 2);
    }
}

function showProfile() {
    $("#surveyBox").removeClass("anim_fadeIn");
    $("#surveyBox").addClass("anim_fadeOut");
    setTimeout(function () {
        $("#profileBox").removeClass("anim_fadeOut");
        $("#profileBox").addClass("anim_fadeIn");
        $("#profileBox").css("visibility", "visible");
    }, 250);
    setTimeout(function () {
        animateProfileBars();
    }, 500);
    console.log("Showing profile");
}

function hideProfile() {
    $("#profileBox").removeClass("anim_fadeIn");
    $("#profileBox").css("visibility", "hidden");
    $("#surveyBox").removeClass("anim_fadeOut");
    $("#surveyBox").addClass("anim_fadeIn");
    resetProfileBars();
}

function resetProfileBars() {
    for (var i = 0; i < 3; i++) {
        setProfileBar(i, 0);
    }
}

function animateProfileBars() {
    $({
        t: 0
    }).animate({
        t: 1
    }, {
        duration: 1000,
        step: function () {
            for (var i = 0; i < 3; i++) {
                setProfileBar(i, this.t * playerData.profile[i] * .01);
            }
        },
        easing: "easeOutCubic"
    });
}

function setProfileBar(id, pct) {
    var BUFFER = .075;
    var bubblePos = (1 - 2 * BUFFER) * pct * 100;
    var bubbleText = Math.round(100 * pct);
    var barWidth = 100 * pct;
    sliderValue = bubbleText;
    $("#profileStatSlider" + id).css("left", bubblePos + "%");
    $("#profileSliderText" + id).text(bubbleText);
    $("#profileSliderFill" + id).css("width", barWidth + "%");
}

function savePlayerData() {
    console.log(playerData);
    localStorage.setItem("cipd-play", JSON.stringify(playerData));
}

function updateSimScore() {
    $("#simScoreName").text(playerData.name);
    $("#simScoreProfile").text(getProfileString(playerData.profile));
    for (var i = 0; i < cellCounts.length; i++) {
        if (cellCounts[i].id == playerData.num) {
            $("#simScoreCount").text(cellCounts[i].count);
        }
    }
    $("#simScoreColor").css("background-color", getColor(playerData.profile));
}
