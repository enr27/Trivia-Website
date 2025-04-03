const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const rooms = {};

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('createRoom', (playerName) => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomCode] = { 
      players: {}, 
      settings: null, 
      questions: [] 
    };

    rooms[roomCode].players[socket.id] = { name: playerName, score: 0 };

    socket.join(roomCode);
    socket.emit('roomCreated', roomCode);
    console.log(`Room created with code ${roomCode} by ${playerName}`);
  });

  socket.on('joinRoom', ({ roomCode, playerName, playerId }) => {
    const room = rooms[roomCode];

    if (room) {
        let player = Object.values(room.players).find(p => p.id === playerId);

        if (player) {
            player.socketId = socket.id;
            console.log(`${playerName} rejoined room ${roomCode}`);
        } else {
            room.players[socket.id] = { id: playerId, name: playerName, score: 0 };
            console.log(`${playerName} joined room ${roomCode}`);
        }

        socket.join(roomCode);
        socket.emit('roomJoined');
    } else {
        socket.emit('error', 'Room not found');
    }
  });

  socket.on('gameSettings', ({ roomCode, category, difficulty, numQuestions }) => {
    if (rooms[roomCode]) {
      rooms[roomCode].settings = { category, difficulty, numQuestions };
      fetchQuestions(category, difficulty, numQuestions).then((questions) => {
        if (!questions || questions.length === 0) {
          io.to(roomCode).emit('error', 'Failed to load questions');
          return;
        }

        rooms[roomCode].questions = questions;
        io.to(roomCode).emit('startGameWithSettings', { category, difficulty, numQuestions });
        sendNextQuestion(roomCode);
      });
    }
  });

  socket.on('submitAnswer', ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || !room.currentQuestion) {
        socket.emit('error', 'No questions available');
        return;
    }

    const correct = room.currentQuestion.correctAnswer === answer;
    if (correct) {
        room.players[socket.id].score += 1;
        socket.emit('scoreUpdate', room.players[socket.id].score);
    }

    socket.emit('answerResult', { correct, correctAnswer: room.currentQuestion.correctAnswer });
  });

  socket.on('nextQuestion', (roomCode) => {
    const room = rooms[roomCode];
    if (!room) return;

    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
    }

    sendNextQuestion(roomCode); 
  });

  function sendNextQuestion(roomCode) {
    const room = rooms[roomCode]; 
    if (!room) return; 

    if (room.timer) {
        clearInterval(room.timer); 
        room.timer = null; 
    }

    if (room.questions.length > 0) {
        const currentQuestion = room.questions.shift();
        room.currentQuestion = currentQuestion;

        io.to(roomCode).emit('newQuestion', currentQuestion);

        room.timeRemaining = 30; 
        room.timer = setInterval(() => {
            room.timeRemaining -= 1; 
            io.to(roomCode).emit('timerUpdate', room.timeRemaining); 

            if (room.timeRemaining <= 0) {
                clearInterval(room.timer); 
                room.timer = null; 
                io.to(roomCode).emit('timeUp', { correctAnswer: room.currentQuestion.correctAnswer });
            }
        }, 1000); 
    } else {
        determineWinner(roomCode);

        if (room.timer) {
            clearInterval(room.timer); 
            room.timer = null;
        }
    }
  }

  function determineWinner(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    const players = Object.entries(room.players);
    const winner = players.reduce((topPlayer, [id, player]) => {
        return player.score > topPlayer.score ? player : topPlayer;
    }, { name: 'No one', score: 0 });

    io.to(roomCode).emit('gameOver', {
        winner: { name: winner.name, score: winner.score },
        scores: Object.values(room.players).map(player => ({
            name: player.name,
            score: player.score
        }))
    });

    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
    }

    delete rooms[roomCode];
  }

  socket.on('disconnect', () => {
  console.log('User disconnected:', socket.id);
  for (const roomCode of Object.keys(rooms)) {
    if (rooms[roomCode].players[socket.id]) {
      delete rooms[roomCode].players[socket.id];
      console.log(`User ${socket.id} removed from room ${roomCode}`);
      if (Object.keys(rooms[roomCode].players).length === 0) {
                if (rooms[roomCode].timer) {
                    clearInterval(rooms[roomCode].timer); 
                }
                delete rooms[roomCode];
      }
    }
  }
 });
});

function fetchQuestions(category, difficulty, numQuestions) {
  return axios.get(`https://opentdb.com/api.php`, {
    params: {
      amount: numQuestions,
      category,
      difficulty,
      type: 'multiple',
    },
  })
  .then((response) => {
    return response.data.results.map((q) => {
      let options = [q.correct_answer, ...q.incorrect_answers];
      options = shuffleArray(options);
      return {
        question: q.question,
        options: options,
        correctAnswer: q.correct_answer,
      };
    });
  })
  .catch((error) => {
    console.error('Error fetching questions:', error);
    return [];
  });
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

server.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
