import express from 'express';
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

var state = {
    "rooms": []
};
app.use(express.static('public'))
// app.get('/', function (req, res) {
//     //res.sendFile(__dirname + '/index.html');
// });

io.on('connection', function (socket) {
    // Login: check if room exists (host)
    socket.on('login-room-check', function (code) {
        var room = getRoom(code);
        if (room != null) {
            socket.emit('room-check-passed', room);
            if (room.state == "sim") {
                socket.emit("sim-update", room.code, room.iterations);
            }
        } else {
            socket.emit('room-check-failed');
        }
    });
    // Login: check if player exists in room (client)
    socket.on('login-player-check', function (code, id) {
        // First check if room exists
        var room = getRoom(code);
        if (room != null) {
            // Check to see if player is in that room
            var player = getPlayer(room, id);
            if (player != null) {
                socket.emit('player-check-passed', player, room);
                if (room.state == "sim") {
                    socket.emit("sim-update", room.code, room.iterations);
                }
            } else {
                socket.emit('player-check-failed');
            }
        } else {
            socket.emit('player-check-failed');
        }
    });
    // Create room (host)
    socket.on('create-room', function () {
        // Generate a random room number that hasn't already been used
        var roomCode = 0;
        var ok = false;
        while (!ok) {
            roomCode = 1000 + Math.floor(9000 * Math.random());
            ok = true;
            for (var i = 0; i < state.rooms.length; i++) {
                if (state.rooms[i].code == roomCode) {
                    ok = false;
                }
            }
        }
        io.sockets.emit('room-created', roomCode);
        var newRoom = createRoom(roomCode);
        socket.emit('state-update', newRoom);
    });
    // Reset room (host)
    socket.on('reset-room', function (roomCode) {
        var room = getRoom(roomCode);
        if (room != null) {
            // Can reset in prep mode
            if (room.state == "prep") {
                room.players = [];
                io.sockets.emit('update-room-members', roomCode);
                io.sockets.emit("state-update-available", roomCode);
            }
        }
    });
    // Add new AI player
    socket.on('add-random-player', function (roomCode) {
        var room = getRoom(roomCode);
        if (room != null) {
            addRandomPlayer(room);
            io.sockets.emit('update-room-members', roomCode);
            io.sockets.emit("state-update-available", roomCode);
        }
    });
    // Start game (host)
    socket.on('start-game', function (roomCode) {
        var room = getRoom(roomCode);
        if (room != null) {
            // Can start game in prep mode
            if (room.state == "prep" && room.players.length >= 2) {
                room.state = "survey";
                io.sockets.emit("state-update-available", roomCode);
            }
        }
    });
    // End game (host)
    socket.on('end-game', function (roomCode) {
        var room = getRoom(roomCode);
        if (room != null) {
            // Can end game in results mode
            if (room.state == "results") {
                io.sockets.emit("kicked-from-room", roomCode);
                deleteRoom(roomCode);
            }
        }
    });
    // Start simulation (host)
    socket.on('prepare-simulation', function (roomCode) {
        var room = getRoom(roomCode);
        if (room != null) {
            // Can start simulation in survey mode
            if (room.state == "survey") {
                room.state = "sim";
                seedGrid(room);
                io.sockets.emit("state-update-available", room.code);
            }
        }
    });
    // Advance simulation (host)
    socket.on('advance-simulation', function (roomCode) {
        var room = getRoom(roomCode);
        if (room != null) {
            // Can advance simulation in sim mode
            if (room.state == "sim") {
                room.iterations++;
                io.sockets.emit("sim-update", room.code, room.iterations);
            }
        }
    });
    // Complete simulation (host)
    socket.on('complete-simulation', function (roomCode, winner, players) {
        var room = getRoom(roomCode);
        if (room != null) {
            // Can complete simulation in sim mode
            if (room.state == "sim") {
                // First update iterations survived
                for (var i = 0; i < room.players.length; i++) {
                    room.players[i].iterationsSurvived = players[i].iterationsSurvived;
                }
                room.state = "results";
                room.winner = winner;
                io.sockets.emit("state-update-available", room.code);
            }
        }
    });
    // Join room (client)
    socket.on('join-room', function (code, name) {
        // Check to see if the room exists
        var room = getRoom(code);
        if (room != null) {
            // Check if state is prep (Can add more players)
            if (room.state == "prep") {
                // OK, add player to the room and let them (and the host) know
                var p = addPlayer(room, name);
                io.sockets.emit("state-update-available", room.code);
                socket.emit("join-room-accepted", p);
            } else {
                // Room is not accepting more members
            }
        } else {
            // No such room exists, tell the player

        }
    });
    // Answer question (client)
    socket.on('answer-submit', function (playerData) {
        // First check if room exists
        var room = getRoom(playerData.roomCode);
        if (room != null) {
            // Check to see if player is in that room
            var player = getPlayer(room, playerData.id);
            if (player != null) {
                player.answers = playerData.answers;
                player.profile = playerData.profile;
                io.sockets.emit("state-update-available", playerData.roomCode);
            } else {

            }
        } else {

        }
    });
    // Request state update
    socket.on('request-state-update', function (code) {
        var roomState = getRoom(code);
        if (roomState != null) {
            socket.emit('state-update', roomState);
            if (roomState.state == "sim") {
                socket.emit('sim-update', roomState.code, roomState.iterations);
            }
        }
    });
    socket.on('disconnect', function () {

    });
});
// Gets environment variables from Heroku. Otherwise, get them locally from the config file.
const PORT = process.env.PORT || 8080
http.listen(PORT, function () {
    console.log(`listening on *:${PORT}`);
});

function createRoom(code) {
    var newRoom = {
        "code": code,
        "state": "prep",
        "players": [],
        "grid": [],
        "iterations": 0,
        "winner": -1
    };
    state.rooms.push(newRoom);
    return newRoom;
}

function addRandomPlayer(room) {
    var adj = ["Fast", "Slow", "Tall", "Short", "Nice", "Mean"];
    var noun = ["Cat", "Dog", "Bunny", "Meme"];
    var num = Math.floor(Math.random() * 90) + 10;
    var name = randomItem(adj) + randomItem(noun) + num;
    var p = addPlayer(room, name);
    for (var i = 0; i < 6; i++) {
        p.answers.push(Math.floor(101 * Math.random()));
    }
    for (var i = 0; i < 3; i++) {
        p.profile[i] = Math.round((p.answers[i] + p.answers[i + 3]) / 2);
    }
}

function deleteRoom(code) {
    var index = -1;
    for (var i = 0; i < state.rooms.length; i++) {
        if (state.rooms[i].code == code) {
            index = i;
        }
    }
    if (index > -1) {
        state.rooms.splice(index, 1);
    }
}

function getRoom(code) {
    for (var i = 0; i < state.rooms.length; i++) {
        if (code == state.rooms[i].code) {
            return state.rooms[i];
        }
    }
    return null;
}

function getPlayer(room, id) {
    for (var i = 0; i < room.players.length; i++) {
        if (id == room.players[i].id) {
            return room.players[i];
        }
    }
    return null;
}

function addPlayer(room, name) {
    var newPlayer = {
        "name": name,
        "id": guid(),
        "roomCode": room.code,
        "answers": [],
        "profile": [50, 50, 50],
        "num": room.players.length,
        "iterationsSurvived": 0
    };
    room.players.push(newPlayer);
    return newPlayer;
}

function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + '-' + s4() + '-' + s4() + '-' +
        s4();
}

function seedGrid(room) {
    room.grid = [];
    var spaces = [];
    // Make an empty grid
    for (var i = 0; i < 50; i++) {
        room.grid[i] = [];
        for (var j = 0; j < 50; j++) {
            room.grid[i][j] = -1;
            var newSpace = [];
            newSpace.push(i);
            newSpace.push(j);
            spaces.push(newSpace);
        }
    }
    // Populate it as evenly as possible with strategies
    var count = 0;
    while (spaces.length > 0) {
        // Get random empty space
        var r = Math.floor(spaces.length * Math.random());
        // Fill that space
        var pickedSpace = spaces[r];
        room.grid[pickedSpace[0]][pickedSpace[1]] = (count % room.players.length);
        spaces.splice(r, 1);
        count++;
    }
}

function randomItem(list) {
    return list[Math.floor(Math.random() * list.length)];
}
