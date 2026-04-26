const functions = require('firebase-functions');

const ROWS = 6;
const COLS = 7;
const PLAYER = 1;
const AI = 2;
const EMPTY = 0;

function isValidLocation(board, col) {
    return board[0][col] === EMPTY;
}

function getNextOpenRow(board, col) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === EMPTY) return r;
    }
    return -1;
}

function checkWin(board, piece) {
    // Horizontal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            if (board[r][c] === piece && board[r][c+1] === piece &&
                board[r][c+2] === piece && board[r][c+3] === piece) return true;
        }
    }
    // Vertical
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS - 3; r++) {
            if (board[r][c] === piece && board[r+1][c] === piece &&
                board[r+2][c] === piece && board[r+3][c] === piece) return true;
        }
    }
    // Positive diagonal
    for (let r = 3; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            if (board[r][c] === piece && board[r-1][c+1] === piece &&
                board[r-2][c+2] === piece && board[r-3][c+3] === piece) return true;
        }
    }
    // Negative diagonal
    for (let r = 3; r < ROWS; r++) {
        for (let c = 3; c < COLS; c++) {
            if (board[r][c] === piece && board[r-1][c-1] === piece &&
                board[r-2][c-2] === piece && board[r-3][c-3] === piece) return true;
        }
    }
    return false;
}

function isBoardFull(board) {
    for (let c = 0; c < COLS; c++) {
        if (isValidLocation(board, c)) return false;
    }
    return true;
}

function getValidLocations(board) {
    const validLocs = [];
    for (let c = 0; c < COLS; c++) {
        if (isValidLocation(board, c)) validLocs.push(c);
    }
    return validLocs;
}

function evaluateWindow(window, piece) {
    let score = 0;
    const oppPiece = piece === PLAYER ? AI : PLAYER;

    const pieceCount = window.filter(cell => cell === piece).length;
    const emptyCount = window.filter(cell => cell === EMPTY).length;
    const oppCount = window.filter(cell => cell === oppPiece).length;

    if (pieceCount === 4) score += 100;
    else if (pieceCount === 3 && emptyCount === 1) score += 10;
    else if (pieceCount === 2 && emptyCount === 2) score += 4;

    if (oppCount === 3 && emptyCount === 1) score -= 80;
    else if (oppCount === 2 && emptyCount === 2) score -= 3;

    return score;
}

function scorePosition(board, piece) {
    let score = 0;
    const oppPiece = piece === PLAYER ? AI : PLAYER;

    const centerCol = Math.floor(COLS / 2);
    let centerCount = 0;
    for (let r = 0; r < ROWS; r++) {
        if (board[r][centerCol] === piece) centerCount++;
    }
    score += centerCount * 6;

    const nearCenterCols = [centerCol - 1, centerCol + 1];
    for (const col of nearCenterCols) {
        if (col >= 0 && col < COLS) {
            let nearCenterCount = 0;
            for (let r = 0; r < ROWS; r++) {
                if (board[r][col] === piece) nearCenterCount++;
            }
            score += nearCenterCount * 3;
        }
    }

    // Horizontal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const win = [board[r][c], board[r][c+1], board[r][c+2], board[r][c+3]];
            score += evaluateWindow(win, piece);
        }
    }

    // Vertical
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS - 3; r++) {
            const win = [board[r][c], board[r+1][c], board[r+2][c], board[r+3][c]];
            score += evaluateWindow(win, piece);
        }
    }

    // Positive diagonal
    for (let r = 3; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const win = [board[r][c], board[r-1][c+1], board[r-2][c+2], board[r-3][c+3]];
            score += evaluateWindow(win, piece);
        }
    }

    // Negative diagonal
    for (let r = 3; r < ROWS; r++) {
        for (let c = 3; c < COLS; c++) {
            const win = [board[r][c], board[r-1][c-1], board[r-2][c-2], board[r-3][c-3]];
            score += evaluateWindow(win, piece);
        }
    }

    // Penalise multiple opponent threats
    let threatCount = 0;
    for (let col = 0; col < COLS; col++) {
        if (isValidLocation(board, col)) {
            const row = getNextOpenRow(board, col);
            board[row][col] = oppPiece;
            if (checkWin(board, oppPiece)) threatCount++;
            board[row][col] = EMPTY;
        }
    }
    if (threatCount > 1) score -= 50;

    // Reward multiple winning moves
    let winningMoves = 0;
    for (let col = 0; col < COLS; col++) {
        if (isValidLocation(board, col)) {
            const row = getNextOpenRow(board, col);
            board[row][col] = piece;
            if (checkWin(board, piece)) winningMoves++;
            board[row][col] = EMPTY;
        }
    }
    if (winningMoves > 1) score += 40;

    return score;
}

function minimax(board, depth, alpha, beta, maximizingPlayer) {
    const validLocs = getValidLocations(board);
    const isTerminal = checkWin(board, PLAYER) || checkWin(board, AI) || validLocs.length === 0;

    if (depth === 0 || isTerminal) {
        if (isTerminal) {
            if (checkWin(board, AI)) return [null, 10000000];
            else if (checkWin(board, PLAYER)) return [null, -10000000];
            else return [null, 0];
        }
        return [null, scorePosition(board, AI)];
    }

    if (maximizingPlayer) {
        let value = -Infinity;
        let column = validLocs[Math.floor(Math.random() * validLocs.length)];

        for (const col of validLocs) {
            const row = getNextOpenRow(board, col);
            const boardCopy = board.map(r => [...r]);
            boardCopy[row][col] = AI;
            const newScore = minimax(boardCopy, depth - 1, alpha, beta, false)[1];

            if (newScore > value) {
                value = newScore;
                column = col;
            }
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        return [column, value];
    } else {
        let value = Infinity;
        let column = validLocs[Math.floor(Math.random() * validLocs.length)];

        for (const col of validLocs) {
            const row = getNextOpenRow(board, col);
            const boardCopy = board.map(r => [...r]);
            boardCopy[row][col] = PLAYER;
            const newScore = minimax(boardCopy, depth - 1, alpha, beta, true)[1];

            if (newScore < value) {
                value = newScore;
                column = col;
            }
            beta = Math.min(beta, value);
            if (alpha >= beta) break;
        }
        return [column, value];
    }
}

// Firebase Cloud Function: returns the best AI move for the given board state
exports.getAIMove = functions.https.onCall((data) => {
    const { board, difficulty } = data;

    if (!board || !Array.isArray(board) || board.length !== ROWS) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid board state provided.');
    }

    for (const row of board) {
        if (!Array.isArray(row) || row.length !== COLS) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid board row dimensions.');
        }
    }

    const allowedDifficulties = ['easy', 'medium', 'hard', 'maximum'];
    if (!allowedDifficulties.includes(difficulty)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid difficulty. Must be easy, medium, hard, or maximum.');
    }

    const depthMap = { easy: 4, medium: 6, hard: 8, maximum: 10 };
    const depth = depthMap[difficulty];

    const boardCopy = board.map(r => [...r]);
    const [column] = minimax(boardCopy, depth, -Infinity, Infinity, true);

    return { column };
});
