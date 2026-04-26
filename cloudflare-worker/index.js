// ─── Constants ────────────────────────────────────────────────────────────────
const ROWS = 6;
const COLS = 7;
const PLAYER = 1;
const AI = 2;
const EMPTY = 0;
const SEARCH_DEPTH = 4;
const ROOM_TTL = 60 * 60; // 1 hour expiry on KV entries

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ─── KV room helpers ──────────────────────────────────────────────────────────
// Room shape stored in KV:
// {
//   board: number[][],
//   turn: 1 | 2,
//   status: "waiting" | "playing" | "done",
//   winner: null | 1 | 2 | "draw",
//   p1LastSeen: number,  // timestamp ms
//   p2LastSeen: number,
// }

async function getRoom(env, code) {
  const raw = await env.CONNECT4_ROOMS.get(code);
  return raw ? JSON.parse(raw) : null;
}

async function saveRoom(env, code, room) {
  await env.CONNECT4_ROOMS.put(code, JSON.stringify(room), { expirationTtl: ROOM_TTL });
}

async function deleteRoom(env, code) {
  await env.CONNECT4_ROOMS.delete(code);
}

// ─── Win check ────────────────────────────────────────────────────────────────
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

function isBoardFull(board) {
  return board[0].every(cell => cell !== EMPTY);
}

// ─── AI minimax ───────────────────────────────────────────────────────────────
function isValidLocation(board, col) { return board[0][col] === EMPTY; }

function getNextOpenRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row--)
    if (board[row][col] === EMPTY) return row;
  return -1;
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
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    // ── GET / — health check ──
    if (method === "GET" && url.pathname === "/") {
      return jsonResponse({ ok: true, service: "connect-4-worker" });
    }

    // ── POST / — AI move ──
    if (method === "POST" && url.pathname === "/") {
      let payload;
      try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
      const { board } = payload;
      if (!board || !Array.isArray(board) || board.length !== ROWS) return jsonResponse({ error: "Invalid board" }, 400);
      for (const row of board) if (!Array.isArray(row) || row.length !== COLS) return jsonResponse({ error: "Invalid row" }, 400);
      const [column] = minimax(board.map(r => [...r]), SEARCH_DEPTH, -Infinity, Infinity, true);
      return jsonResponse({ column });
    }

    // ── POST /create-room ──
    if (method === "POST" && url.pathname === "/create-room") {
      let code = makeRoomCode();
      while (await env.CONNECT4_ROOMS.get(code)) code = makeRoomCode();

      const room = {
        board: emptyBoard(),
        turn: 1,
        status: "waiting",
        winner: null,
        p1LastSeen: Date.now(),
        p2LastSeen: 0,
      };
      await saveRoom(env, code, room);
      return jsonResponse({ code });
    }

    // ── POST /join-room ──
    if (method === "POST" && url.pathname === "/join-room") {
      let payload;
      try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
      const code = payload.code?.toUpperCase();
      if (!code) return jsonResponse({ error: "Missing code" }, 400);

      const room = await getRoom(env, code);
      if (!room) return jsonResponse({ error: "Room not found" }, 404);
      if (room.status !== "waiting") return jsonResponse({ error: "Room is full or already started" }, 409);

      room.status = "playing";
      room.p2LastSeen = Date.now();
      await saveRoom(env, code, room);
      return jsonResponse({ ok: true, board: room.board, turn: room.turn });
    }

    // ── GET /poll?room=CODE&player=1or2 ──
    if (method === "GET" && url.pathname === "/poll") {
      const code = url.searchParams.get("room")?.toUpperCase();
      const player = parseInt(url.searchParams.get("player"));
      if (!code || !player) return jsonResponse({ error: "Missing params" }, 400);

      const room = await getRoom(env, code);
      if (!room) return jsonResponse({ error: "Room not found" }, 404);

      // Heartbeat
      if (player === 1) room.p1LastSeen = Date.now();
      else room.p2LastSeen = Date.now();

      // Opponent disconnect detection (8s timeout)
      const now = Date.now();
      const opponentLastSeen = player === 1 ? room.p2LastSeen : room.p1LastSeen;
      const opponentGone = opponentLastSeen > 0 && (now - opponentLastSeen) > 8000;

      await saveRoom(env, code, room);

      return jsonResponse({
        board: room.board,
        turn: room.turn,
        status: room.status,
        winner: room.winner,
        opponentGone,
        opponentJoined: room.status === "playing",
      });
    }

    // ── POST /move ──
    if (method === "POST" && url.pathname === "/move") {
      let payload;
      try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
      const { code, player, col } = payload;
      if (!code || !player || col === undefined) return jsonResponse({ error: "Missing params" }, 400);

      const room = await getRoom(env, code.toUpperCase());
      if (!room) return jsonResponse({ error: "Room not found" }, 404);
      if (room.status !== "playing") return jsonResponse({ error: "Game not in progress" }, 400);
      if (room.turn !== player) return jsonResponse({ error: "Not your turn" }, 400);
      if (col < 0 || col >= COLS || room.board[0][col] !== EMPTY) return jsonResponse({ error: "Invalid column" }, 400);

      // Apply move
      let row = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (room.board[r][col] === EMPTY) { row = r; break; }
      }
      room.board[row][col] = player;

      if (checkWin(room.board, player)) {
        room.status = "done";
        room.winner = player;
      } else if (isBoardFull(room.board)) {
        room.status = "done";
        room.winner = "draw";
      } else {
        room.turn = player === 1 ? 2 : 1;
      }

      await saveRoom(env, code.toUpperCase(), room);
      return jsonResponse({ ok: true, board: room.board, turn: room.turn, status: room.status, winner: room.winner });
    }

    // ── POST /rematch ──
    if (method === "POST" && url.pathname === "/rematch") {
      let payload;
      try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
      const code = payload.code?.toUpperCase();
      if (!code) return jsonResponse({ error: "Missing code" }, 400);

      const room = await getRoom(env, code);
      if (!room) return jsonResponse({ error: "Room not found" }, 404);

      room.board = emptyBoard();
      room.turn = 1;
      room.status = "playing";
      room.winner = null;
      await saveRoom(env, code, room);
      return jsonResponse({ ok: true });
    }

    // ── POST /leave-room ──
    if (method === "POST" && url.pathname === "/leave-room") {
      let payload;
      try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
      const code = payload.code?.toUpperCase();
      if (code) await deleteRoom(env, code);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
