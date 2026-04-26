// ─── Constants ───────────────────────────────────────────────────────────────
const ROWS = 6;
const COLS = 7;
const PLAYER = 1;
const AI = 2;
const EMPTY = 0;
const SEARCH_DEPTH = 4; // reduced from 6 to stay within free-tier CPU limit

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Upgrade",
};

// ─── In-memory room store ─────────────────────────────────────────────────────
// Rooms live only as long as this Worker instance is alive.
// Each room: { p1: WebSocket, p2: WebSocket|null, board: number[][], turn: 1|2 }
const rooms = new Map();

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function send(ws, msg) {
  try { ws.send(JSON.stringify(msg)); } catch (_) {}
}

// ─── WebSocket multiplayer ────────────────────────────────────────────────────
function handleWebSocket(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("room")?.toUpperCase();

  if (!code) return jsonResponse({ error: "Missing ?room= param" }, 400);

  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();

  let room = rooms.get(code);
  let playerNum;

  if (!room) {
    // First player — create the room
    room = { p1: server, p2: null, board: emptyBoard(), turn: 1 };
    rooms.set(code, room);
    playerNum = 1;
    send(server, { type: "waiting", message: "Waiting for opponent...", player: 1 });
  } else if (!room.p2) {
    // Second player — join and start
    room.p2 = server;
    playerNum = 2;
    send(server, { type: "start", player: 2, turn: 1, board: room.board });
    send(room.p1, { type: "start", player: 1, turn: 1, board: room.board });
  } else {
    // Room is full
    send(server, { type: "error", message: "Room is full." });
    server.close(1008, "Room full");
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Message handler ──
  server.addEventListener("message", (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.type === "move") {
      const col = msg.col;

      // Validate it's this player's turn
      if (room.turn !== playerNum) {
        send(server, { type: "error", message: "Not your turn." });
        return;
      }

      // Validate column
      if (typeof col !== "number" || col < 0 || col >= COLS) {
        send(server, { type: "error", message: "Invalid column." });
        return;
      }

      // Find the row
      let row = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (room.board[r][col] === EMPTY) { row = r; break; }
      }
      if (row === -1) {
        send(server, { type: "error", message: "Column is full." });
        return;
      }

      // Apply the move
      room.board[row][col] = playerNum;

      // Check for win or draw
      const won = checkWin(room.board, playerNum);
      const draw = !won && room.board[0].every((cell, c) => room.board[0][c] !== EMPTY);
      const nextTurn = playerNum === 1 ? 2 : 1;
      if (!won && !draw) room.turn = nextTurn;

      const update = {
        type: "update",
        board: room.board,
        lastMove: { row, col, player: playerNum },
        turn: won || draw ? null : nextTurn,
        winner: won ? playerNum : null,
        draw: draw || false,
      };

      send(room.p1, update);
      if (room.p2) send(room.p2, update);

      // Clean up finished rooms
      if (won || draw) rooms.delete(code);
    }

    if (msg.type === "rematch") {
      room.board = emptyBoard();
      room.turn = 1;
      const reset = { type: "rematch", board: room.board, turn: 1 };
      send(room.p1, reset);
      if (room.p2) send(room.p2, reset);
    }
  });

  // ── Close handler ──
  server.addEventListener("close", () => {
    const r = rooms.get(code);
    if (!r) return;
    const other = playerNum === 1 ? r.p2 : r.p1;
    if (other) send(other, { type: "opponent_left" });
    rooms.delete(code);
  });

  return new Response(null, { status: 101, webSocket: client });
}

// ─── AI minimax (unchanged from your original) ────────────────────────────────
function isValidLocation(board, col) { return board[0][col] === EMPTY; }

function getNextOpenRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === EMPTY) return row;
  }
  return -1;
}

function checkWin(board, piece) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS - 3; c++)
      if (board[r][c] === piece && board[r][c+1] === piece && board[r][c+2] === piece && board[r][c+3] === piece) return true;
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS - 3; r++)
      if (board[r][c] === piece && board[r+1][c] === piece && board[r+2][c] === piece && board[r+3][c] === piece) return true;
  for (let r = 3; r < ROWS; r++)
    for (let c = 0; c < COLS - 3; c++)
      if (board[r][c] === piece && board[r-1][c+1] === piece && board[r-2][c+2] === piece && board[r-3][c+3] === piece) return true;
  for (let r = 3; r < ROWS; r++)
    for (let c = 3; c < COLS; c++)
      if (board[r][c] === piece && board[r-1][c-1] === piece && board[r-2][c-2] === piece && board[r-3][c-3] === piece) return true;
  return false;
}

function getValidLocations(board) {
  return Array.from({ length: COLS }, (_, c) => c).filter(c => isValidLocation(board, c));
}

function evaluateWindow(window, piece) {
  let score = 0;
  const opp = piece === PLAYER ? AI : PLAYER;
  const pc = window.filter(x => x === piece).length;
  const ec = window.filter(x => x === EMPTY).length;
  const oc = window.filter(x => x === opp).length;
  if (pc === 4) score += 100;
  else if (pc === 3 && ec === 1) score += 10;
  else if (pc === 2 && ec === 2) score += 4;
  if (oc === 3 && ec === 1) score -= 80;
  else if (oc === 2 && ec === 2) score -= 3;
  return score;
}

function scorePosition(board, piece) {
  let score = 0;
  const center = Math.floor(COLS / 2);
  score += board.filter(r => r[center] === piece).length * 6;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS - 3; c++)
      score += evaluateWindow([board[r][c], board[r][c+1], board[r][c+2], board[r][c+3]], piece);
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS - 3; r++)
      score += evaluateWindow([board[r][c], board[r+1][c], board[r+2][c], board[r+3][c]], piece);
  for (let r = 3; r < ROWS; r++)
    for (let c = 0; c < COLS - 3; c++)
      score += evaluateWindow([board[r][c], board[r-1][c+1], board[r-2][c+2], board[r-3][c+3]], piece);
  for (let r = 3; r < ROWS; r++)
    for (let c = 3; c < COLS; c++)
      score += evaluateWindow([board[r][c], board[r-1][c-1], board[r-2][c-2], board[r-3][c-3]], piece);
  return score;
}

function minimax(board, depth, alpha, beta, maximizing) {
  const valid = getValidLocations(board);
  const terminal = checkWin(board, PLAYER) || checkWin(board, AI) || valid.length === 0;
  if (depth === 0 || terminal) {
    if (terminal) {
      if (checkWin(board, AI)) return [null, 10000000];
      if (checkWin(board, PLAYER)) return [null, -10000000];
      return [null, 0];
    }
    return [null, scorePosition(board, AI)];
  }
  let value = maximizing ? -Infinity : Infinity;
  let column = valid[Math.floor(Math.random() * valid.length)];
  for (const col of valid) {
    const row = getNextOpenRow(board, col);
    const copy = board.map(r => [...r]);
    copy[row][col] = maximizing ? AI : PLAYER;
    const score = minimax(copy, depth - 1, alpha, beta, !maximizing)[1];
    if (maximizing ? score > value : score < value) { value = score; column = col; }
    if (maximizing) alpha = Math.max(alpha, value); else beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return [column, value];
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    // ── WebSocket upgrade: GET /multiplayer?room=ABC123 ──
    if (method === "GET" && url.pathname === "/multiplayer") {
      const upgrade = request.headers.get("Upgrade");
      if (upgrade !== "websocket") return jsonResponse({ error: "Expected WebSocket upgrade" }, 426);
      return handleWebSocket(request);
    }

    // ── Create room: POST /create-room ──
    if (method === "POST" && url.pathname === "/create-room") {
      let code = makeRoomCode();
      // Avoid collisions with existing rooms
      while (rooms.has(code)) code = makeRoomCode();
      // Don't create the room yet — the WebSocket connection does that.
      // Just return a code the client can use to connect.
      return jsonResponse({ code });
    }

    // ── Health check + AI: GET / ──
    if (method === "GET" && url.pathname === "/") {
      return jsonResponse({ ok: true, service: "connect-4-worker" });
    }

    // ── AI move: POST / ──
    if (method === "POST" && url.pathname === "/") {
      let payload;
      try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
      const { board } = payload;
      if (!board || !Array.isArray(board) || board.length !== ROWS) return jsonResponse({ error: "Invalid board" }, 400);
      for (const row of board) if (!Array.isArray(row) || row.length !== COLS) return jsonResponse({ error: "Invalid row" }, 400);
      const [column] = minimax(board.map(r => [...r]), SEARCH_DEPTH, -Infinity, Infinity, true);
      return jsonResponse({ column });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
