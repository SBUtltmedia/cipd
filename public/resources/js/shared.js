var iterationsRun = 0;
var payoffTable = [];
var localGrid = [];
var cellCounts = [];
var simReady = false;

function updateSim(iterations) {
    while (iterationsRun < iterations) {
        iterateLocalGrid();
    }
    // Update cell counts
    computeCellCounts();
    updateCellCounts();
    // Update the grid colors
    updateSimCells();
    if (ROLE == "client") {
        updateSimScore();
    }
}

function updateSimulation() {
    if (payoffTable.length == 0) {
        iterationsRun = 0;
        makePayoffTable();
        setLocalGrid();
        simReady = true;
    }
    updateSimCells();
    if (ROLE == "client") {
        updateSimScore();
    }
}

// Get player 1's payoff (x is player 1's strat, y is player 2's strat)
function getPayoff(x, y) {
    // Constants
    var R = 3;
    var S = 0;
    var T = 5;
    var P = 1;
    if (y >= x) {
        return (R - T) * x + (T - P) * y + P;
    } else {
        return (S - P) * x + (R - S) * y + P;
    }
}

// Get the average payoffs of two strategies after some number of rounds
function getRepeatedPayoff(s1, s2, rounds) {
    var payoffs = [0, 0];
    var last1 = 0;
    var last2 = 0;
    for (var i = 0; i < rounds; i++) {
        var x = 0;
        var y = 0;
        if (i == 0) {
            // Starting strategy
            x = s1[0];
            y = s2[0];
        } else {
            // React to opponent's last strategy
            x = s1[2] + last2 * (s1[1] - s1[2]);
            y = s2[2] + last1 * (s2[1] - s2[2]);
        }
        // Compute payoffs
        payoffs[0] += getPayoff(x, y);
        payoffs[1] += getPayoff(y, x);
        // Remember strategies
        last1 = x;
        last2 = y;
    }
    payoffs[0] /= rounds;
    payoffs[1] /= rounds;
    return payoffs;
}

function makePayoffTable() {
    payoffTable = [];
    // Number of rounds to play
    var GAME_ROUNDS = 20;
    // Initialize
    for (var i = 0; i < roomState.players.length; i++) {
        payoffTable[i] = [];
        for (var j = i; j < roomState.players.length; j++) {
            payoffTable[i][j] = 0;
        }
    }
    // Fill in table
    for (var i = 0; i < roomState.players.length; i++) {
        for (var j = i; j < roomState.players.length; j++) {
            var strats = [[0, 0, 0], [0, 0, 0]];
            for (var k = 0; k < 3; k++) {
                strats[0][k] = roomState.players[i].profile[k] / 100;
                strats[1][k] = roomState.players[j].profile[k] / 100;
            }
            var payoffs = getRepeatedPayoff(strats[0], strats[1], GAME_ROUNDS);
            payoffTable[i][j] = payoffs[0];
            payoffTable[j][i] = payoffs[1];
        }
    }
}

function setLocalGrid() {
    localGrid = [];
    for (var i = 0; i < roomState.grid.length; i++) {
        localGrid[i] = [];
        for (var j = 0; j < roomState.grid[i].length; j++) {
            localGrid[i][j] = roomState.grid[i][j];
        }
    }
    computeCellCounts();
    updateCellCounts();
}

function iterateLocalGrid() {
    iterationsRun++;
    var changedCells = 0;
    var gridWidth = localGrid.length;
    var gridHeight = localGrid[0].length;
    // Perform iteration procedure
    // First, get the scores for each cell when playing against its 8 neighbors (including wrap-around cells)
    var scoreMatrix = [];
    for (var i = 0; i < localGrid.length; i++) {
        scoreMatrix[i] = [];
        for (var j = 0; j < localGrid.length; j++) {
            var totalPayoff = 0;
            // Get cell ID
            var cellID = localGrid[i][j];
            // Add the scores earned when this cell plays against its neighbors
            for (var k = -1; k <= 1; k++) {
                for (var l = -1; l <= 1; l++) {
                    // Make sure the cell isn't playing against itself
                    if (k != 0 || l != 0) {
                        // Get coordinates of opponent
                        var opponentX = (i + k + gridWidth) % gridWidth;
                        var opponentY = (j + l + gridHeight) % gridHeight;
                        // Get opponent cell's ID
                        var opponentID = localGrid[opponentX][opponentY];
                        // Get payoff
                        var payoff = payoffTable[cellID][opponentID];
                        // Add payoff to total
                        totalPayoff += payoff;
                    }
                }
            }
            // Set score matrix entry
            scoreMatrix[i][j] = totalPayoff;
        }
    }
    // Now, each cell checks which of its neighbors has the highest score, and becomes that strategy
    var newGrid = [];
    for (var i = 0; i < localGrid.length; i++) {
        newGrid[i] = [];
        for (var j = 0; j < localGrid.length; j++) {
            var maxScore = -1;
            var maxID = [];
            // Add the scores earned when this cell plays against its neighbors
            for (var k = -1; k <= 1; k++) {
                for (var l = -1; l <= 1; l++) {
                    // Get coordinates of cell to check
                    var checkX = (i + k + gridWidth) % gridWidth;
                    var checkY = (j + l + gridHeight) % gridHeight;
                    // Get score for that cell
                    var checkScore = scoreMatrix[checkX][checkY];
                    var checkID = localGrid[checkX][checkY];
                    // See if this is the new best score
                    if (checkScore > maxScore) {
                        maxScore = checkScore;
                        maxID = [];
                        maxID.push(checkID);
                    } else if (checkScore == maxScore) {
                        maxID.push(checkID);
                    }
                }
            }
            // Become the max ID
            newGrid[i][j] = maxID[0];
            if (localGrid[i][j] != newGrid[i][j]) {
                changedCells++;
            }
        }
    }
    localGrid = newGrid;
    var oldCellCounts = JSON.parse(JSON.stringify(cellCounts));
    computeCellCounts();
    updateCellCounts();
    if (ROLE == "host") {
        if (changedCells == 0) {
            // Nothing changed; simulation is stable
            finishSimulation(false);
        } else if (oldCellCounts.length > 0) {
            var isChanged = false;
            for (var i = 0; i < cellCounts.length; i++) {
                if ((cellCounts[i].count != oldCellCounts[i].count) || (cellCounts[i].id != oldCellCounts[i].id)) {
                    isChanged = true;
                }
            }
            if (!isChanged) {
                // No cell counts changed; simulation is stable
                finishSimulation(false);
            }
        }
    }
}

function computeCellCounts() {
    console.log("update cell counts");
    cellCounts = [];
    for (var i = 0; i < roomState.players.length; i++) {
        cellCounts.push({
            id: i,
            count: 0
        });
    }
    for (var i = 0; i < localGrid.length; i++) {
        for (var j = 0; j < localGrid[i].length; j++) {
            cellCounts[localGrid[i][j]].count++;
        }
    }
    cellCounts.sort(function (a, b) {
        return b.count - a.count;
    });
}

function updateCellCounts() {
    for (var i = 0; i < 10; i++) {
        if (i < cellCounts.length) {
            $("#simScoreName" + i).text(roomState.players[cellCounts[i].id].name);
            var prof = roomState.players[cellCounts[i].id].profile;
            var profStr = getProfileString(prof);
            $("#simScoreProfile" + i).text(profStr);
            $("#simScoreCount" + i).text(cellCounts[i].count);
            $("#simScoreColor" + i).css("background-color", getColor(roomState.players[cellCounts[i].id].profile));
            if (cellCounts[i].count > 0) {
                $("#simScore" + i).css("visibility", "visible");
            } else {
                $("#simScore" + i).css("visibility", "hidden");
            }
        } else {
            $("#simScore" + i).css("visibility", "hidden");
        }
    };
    $("#simIterations").text("ITERATION " + iterationsRun);
    // Update iterations survived
    for (var i = 0; i < cellCounts.length; i++) {
        if (cellCounts[i].count > 0) {
            roomState.players[cellCounts[i].id].iterationsSurvived = iterationsRun;
        }
    }
}

function makeSimCells() {
    $("#simGrid").empty();
    for (var i = 0; i < 50; i++) {
        for (var j = 0; j < 50; j++) {
            $("#simGrid").append('<div id="cell' + i + '-' + j + '" class="cell"></div>');
            $("#cell" + i + "-" + j).css({
                "left": (2 * i) + "%",
                "top": (2 * j) + "%"
            });
        }
    }
}

function updateSimCells() {
    for (var i = 0; i < 50; i++) {
        for (var j = 0; j < 50; j++) {
            var cellStats = roomState.players[localGrid[i][j]].profile;
            $("#cell" + i + "-" + j).css("background-color", getColor(cellStats));
        }
    }
}

function finishSimulation(wasForced) {
    var winner = cellCounts[0].id;
    if (wasForced) {
        $("#resultsTitleText").text("TERMINATED");
    }
    else {
        $("#resultsTitleText").text("STABILIZED");
    }
    currentSocket.emit("complete-simulation", roomState.code, winner, roomState.players);
}

function getColor(profile) {
    var color = "#";
    for (var k = 0; k < 3; k++) {
        color += leftpad(Math.floor(2.55 * profile[k]).toString(16), 2, "0");
    }
    return color;
}

function leftpad(str, len, ch) {
    str = String(str);
    var i = -1;
    if (!ch && ch !== 0) ch = ' ';
    len = len - str.length;
    while (++i < len) {
        str = ch + str;
    }
    return str;
}

function getProfileString(prof) {
    return "(" + prof[0] + "/" + prof[1] + "/" + prof[2] + ")";
}