const socket = io();
let score = 0;
let questions = [];
let roomCode = null;
let isRoomCreator = false;
let playerName = null;
let timerInterval; 

window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    roomCode = params.get('roomCode');
    playerName = params.get('playerName');
    let playerId = localStorage.getItem('playerId');

    if (roomCode && playerName) {
        if (!playerId) {
            playerId = generatePlayerId();
            localStorage.setItem('playerId', playerId);
        }
        socket.emit('joinRoom', { roomCode, playerName, playerId });
    }
};

function generatePlayerId() {
    return Math.random().toString(36).substring(2, 15);
}

document.getElementById('startGame').addEventListener('click', () => {
    document.getElementById('playModal').style.display = 'flex';
});

document.getElementById('modalPlayButton').addEventListener('click', () => {
    const inputRoomCode = document.getElementById('modalRoomCode').value.trim();
    const playerName = document.getElementById('modalPlayerName').value.trim();

    if (!playerName) {
        alert('Name is required to join the game!');
        return;
    }

    document.getElementById('playModal').style.display = 'none';

    if (inputRoomCode) {
        roomCode = inputRoomCode;
        socket.emit('joinRoom', { roomCode, playerName });
    } else {
        socket.emit('createRoom', playerName);
        isRoomCreator = true; 
    }
});

document.getElementById('modalExitButton').addEventListener('click', () => {
    document.getElementById('playModal').style.display = 'none';

    document.querySelector('.home').style.display = 'flex'; 
    document.querySelector('.header').style.display = 'flex';
    document.getElementById('gameArea').style.display = 'none'; 
    document.getElementById('endGameArea').style.display = 'none';
    document.getElementById('modalRoomCode').value = '';
    document.getElementById('modalPlayerName').value = '';
});

socket.on('roomCreated', (generatedRoomCode) => {
    roomCode = generatedRoomCode;

    const roomCreatedModal = document.getElementById('roomCreatedModal');
    roomCreatedModal.style.display = 'flex';

    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    roomCodeDisplay.querySelector('strong').textContent = roomCode;

    document.getElementById('roomCreatedContinueButton').addEventListener('click', () => {
        roomCreatedModal.style.display = 'none'; 

        if (isRoomCreator) {
            const numQuestions = document.getElementById('numQuestions').value;
            const category = document.getElementById('category').value;
            const difficulty = document.getElementById('difficulty').value;

            socket.emit('gameSettings', { roomCode, category, difficulty, numQuestions });
        }

        updateUrlWithParams({ roomCode, playerName }); 
        transitionToGameScreen();
    });
});

socket.on('roomJoined', () => {
    alert(`Joined room ${roomCode}`);
    updateUrlWithParams({ roomCode, playerName }); 
    transitionToGameScreen();
});

socket.on('error', (message) => {
    alert(message);
});

socket.on('startGameWithSettings', () => {
    alert("Click 'OK' to begin the game!");
});

socket.on('newQuestion', (question) => {
    displayQuestion(question);
});

function displayQuestion(question) {
    document.getElementById('question').textContent = decodeHtml(question.question);
    const optionsContainer = document.getElementById('options');
    optionsContainer.innerHTML = '';

    question.options.forEach((answer) => {
        const btn = document.createElement('button');
        btn.textContent = decodeHtml(answer);
        btn.addEventListener('click', () => checkAnswer(answer, question.correctAnswer));
        optionsContainer.appendChild(btn);
    });

    startTimer(30);
}

socket.on('timeUp', ({ correctAnswer }) => {
    alert(`Time's up! The correct answer was: ${decodeHtml(correctAnswer)}`);
    socket.emit('nextQuestion', roomCode);
});

function startTimer(seconds) {
    const timerElement = document.getElementById('timer');
    let timeLeft = seconds;

    if (timerInterval) {
        clearInterval(timerInterval);
    }

    const updateTimer = () => {
        if (timeLeft > 0) {
            timerElement.textContent = `Time: ${timeLeft} seconds`;
            timeLeft--;
        } else {
            timerElement.textContent = `Time's up!`;
            clearInterval(timerInterval);
        }
    };

    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

function checkAnswer(selectedAnswer, correctAnswer) {
    socket.emit('submitAnswer', { roomCode, answer: selectedAnswer });
}

socket.on('answerResult', ({ correct, correctAnswer }) => {
    alert(correct ? "Correct!" : `Wrong! The correct answer was: ${decodeHtml(correctAnswer)}`);
    socket.emit('nextQuestion', roomCode);
});

socket.on('scoreUpdate', (newScore) => {
    score = newScore;
    document.getElementById('score').textContent = `Score: ${score}`;
});

socket.on('gameOver', ({ winner, scores }) => {
    const winnerMessage = winner 
        ? `The winner is ${winner.name} with ${winner.score} points!`
        : "It's a tie!";

    let scoreDetails = "Final Scores:\n";
    scores.forEach(player => {
        scoreDetails += `${player.name}: ${player.score}\n`;
    });

    alert(`${winnerMessage}\n${scoreDetails}`);
    socket.disconnect();
    window.location.href = '/';
});

socket.on('connect', () => {
    console.log('A user connected:', socket.id);
});

function resetGameUI() {
    document.querySelector('.home').style.display = 'flex';
    document.querySelector('.header').style.display = 'flex';

    document.getElementById('gameArea').style.display = 'none';
    document.getElementById('endGameArea').style.display = 'none';

    score = 0;
    questions = [];
}

function transitionToGameScreen() {
    document.querySelector('.home').style.display = 'none';
    document.querySelector('.header').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
}

function decodeHtml(html) {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
}

function updateUrlWithParams(params) {
    const currentUrl = new URL(window.location);
    Object.entries(params).forEach(([key, value]) => {
        currentUrl.searchParams.set(key, value); 
    });
    window.history.pushState({}, '', currentUrl); 
}
