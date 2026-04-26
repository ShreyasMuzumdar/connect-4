const ROWS = 6;
const COLS = 7;
const PLAYER = 1;
const AI = 2;
const EMPTY = 0;
const SEARCH_DEPTH = 6;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isValidLocation(board, col) {
  return board[0][col] === EMPTY;
}

function getNextOpenRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === EMPTY) {
      return row;
    }
  }
  return -1;
}

function checkWin(board, piece) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 3; col++) {
      if (
        board[row][col] === piece &&
        board[row][col + 1] === piece &&
        board[row][col + 2] === piece &&
        board[row][col + 3] === piece
      ) {
        return true;
      }
    }
  }

  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS - 3; row++) {
      if (
        board[row][col] === piece &&
        board[row + 1][col] === piece &&
        board[row + 2][col] === piece &&
        board[row + 3][col] === piece
      ) {
        return true;
      }
    }
  }

  for (let row = 3; row < ROWS; row++) {
    for (let col = 0; col < COLS - 3; col++) {
      if (
        board[row][col] === piece &&
        board[row - 1][col + 1] === piece &&
        board[row - 2][col + 2] === piece &&
        board[row - 3][col + 3] === piece
      ) {
        return true;
      }
    }
  }

  for (let row = 3; row < ROWS; row++) {
    for (let col = 3; col < COLS; col++) {
      if (
        board[row][col] === piece &&
        board[row - 1][col - 1] === piece &&
        board[row - 2][col - 2] === piece &&
        board[row - 3][col - 3] === piece
      ) {
        return true;
      }
    }
  }

  return false;
}

function getValidLocations(board) {
  const validLocations = [];
  for (let col = 0; col < COLS; col++) {
    if (isValidLocation(board, col)) {
      validLocations.push(col);
    }
  }
  return validLocations;
}

function evaluateWindow(window, piece) {
  let score = 0;
  const oppPiece = piece === PLAYER ? AI : PLAYER;

  const pieceCount = window.filter((cell) => cell === piece).length;
  const emptyCount = window.filter((cell) => cell === EMPTY).length;
  const oppCount = window.filter((cell) => cell === oppPiece).length;

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
  for (let row = 0; row < ROWS; row++) {
    if (board[row][centerCol] === piece) {
      centerCount++;
    }
  }
  score += centerCount * 6;

  const nearCenterCols = [centerCol - 1, centerCol + 1];
  for (const col of nearCenterCols) {
    if (col >= 0 && col < COLS) {
      let nearCenterCount = 0;
      for (let row = 0; row < ROWS; row++) {
        if (board[row][col] === piece) {
          nearCenterCount++;
        }
      }
      score += nearCenterCount * 3;
    }
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 3; col++) {
      const window = [board[row][col], board[row][col + 1], board[row][col + 2], board[row][col + 3]];
      score += evaluateWindow(window, piece);
    }
  }

  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS - 3; row++) {
      const window = [board[row][col], board[row + 1][col], board[row + 2][col], board[row + 3][col]];
      score += evaluateWindow(window, piece);
    }
  }

  for (let row = 3; row < ROWS; row++) {
    for (let col = 0; col < COLS - 3; col++) {
      const window = [board[row][col], board[row - 1][col + 1], board[row - 2][col + 2], board[row - 3][col + 3]];
      score += evaluateWindow(window, piece);
    }
  }

  for (let row = 3; row < ROWS; row++) {
    for (let col = 3; col < COLS; col++) {
      const window = [board[row][col], board[row - 1][col - 1], board[row - 2][col - 2], board[row - 3][col - 3]];
      score += evaluateWindow(window, piece);
    }
  }

  let threatCount = 0;
  for (let col = 0; col < COLS; col++) {
    if (isValidLocation(board, col)) {
      const row = getNextOpenRow(board, col);
      board[row][col] = oppPiece;
      if (checkWin(board, oppPiece)) {
        threatCount++;
      }
      board[row][col] = EMPTY;
    }
  }
  if (threatCount > 1) {
    score -= 50;
  }

  let winningMoves = 0;
  for (let col = 0; col < COLS; col++) {
    if (isValidLocation(board, col)) {
      const row = getNextOpenRow(board, col);
      board[row][col] = piece;
      if (checkWin(board, piece)) {
        winningMoves++;
      }
      board[row][col] = EMPTY;
    }
  }
  if (winningMoves > 1) {
    score += 40;
  }

  return score;
}

function minimax(board, depth, alpha, beta, maximizingPlayer) {
  const validLocations = getValidLocations(board);
  const isTerminal = checkWin(board, PLAYER) || checkWin(board, AI) || validLocations.length === 0;

  if (depth === 0 || isTerminal) {
    if (isTerminal) {
      if (checkWin(board, AI)) return [null, 10000000];
      if (checkWin(board, PLAYER)) return [null, -10000000];
      return [null, 0];
    }
    return [null, scorePosition(board, AI)];
  }

  if (maximizingPlayer) {
    let value = -Infinity;
    let column = validLocations[Math.floor(Math.random() * validLocations.length)];

    for (const col of validLocations) {
      const row = getNextOpenRow(board, col);
      const boardCopy = board.map((currentRow) => [...currentRow]);
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
  }

  let value = Infinity;
  let column = validLocations[Math.floor(Math.random() * validLocations.length)];

  for (const col of validLocations) {
    const row = getNextOpenRow(board, col);
    const boardCopy = board.map((currentRow) => [...currentRow]);
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

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET") {
      return jsonResponse({ ok: true, service: "connect-4-ai-worker" });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { board } = payload;

    if (!board || !Array.isArray(board) || board.length !== ROWS) {
      return jsonResponse({ error: "Invalid board state provided" }, 400);
    }

    for (const row of board) {
      if (!Array.isArray(row) || row.length !== COLS) {
        return jsonResponse({ error: "Invalid board row dimensions" }, 400);
      }
    }

    const boardCopy = board.map((row) => [...row]);
    const [column] = minimax(boardCopy, SEARCH_DEPTH, -Infinity, Infinity, true);

    return jsonResponse({ column });
  },
};
