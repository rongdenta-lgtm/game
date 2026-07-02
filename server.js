const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const SETS_FILE = path.join(DATA_DIR, "question-sets.json");
const BODY_LIMIT = 12 * 1024 * 1024;

const sessions = new Map();
const sseClients = new Set();

ensureData();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "เกิดข้อผิดพลาดในระบบ" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const hosts = getLocalHosts();
  console.log(`Quiz game is running:`);
  console.log(`Local:   http://localhost:${PORT}/admin`);
  hosts.forEach((host) => console.log(`Network: http://${host}:${PORT}/admin`));
});

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SETS_FILE)) {
    const starter = [
      {
        id: crypto.randomUUID(),
        title: "เกมตอบไวชิงรางวัล",
        description: "ชุดตัวอย่างพร้อมเล่น",
        createdAt: new Date().toISOString(),
        questions: [
          {
            id: crypto.randomUUID(),
            text: "สีใดเป็นสีหลักของปุ่มคำตอบในเกมนี้?",
            image: "",
            options: ["แดง", "น้ำเงิน", "เขียว", "เหลือง"],
            correctIndex: 1
          },
          {
            id: crypto.randomUUID(),
            text: "ผู้เล่นที่ตอบถูกและเร็วกว่า จะได้อะไร?",
            image: "",
            options: ["คะแนนน้อยกว่า", "คะแนนเท่ากัน", "คะแนนมากกว่า", "ไม่ได้คะแนน"],
            correctIndex: 2
          }
        ]
      }
    ];
    fs.writeFileSync(SETS_FILE, JSON.stringify(starter, null, 2));
  }
}

async function handleApi(req, res, url) {
  const method = req.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/sets") {
    sendJson(res, 200, { sets: readSets() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/sets") {
    const body = await readJson(req);
    const sets = readSets();
    const newSet = normalizeSet({
      id: crypto.randomUUID(),
      title: body.title || "ชุดคำถามใหม่",
      description: body.description || "",
      createdAt: new Date().toISOString(),
      questions: body.questions || []
    });
    sets.unshift(newSet);
    writeSets(sets);
    sendJson(res, 201, { set: newSet });
    return;
  }

  if (method === "PUT" && parts[1] === "sets" && parts[2]) {
    const body = await readJson(req);
    const sets = readSets();
    const index = sets.findIndex((set) => set.id === parts[2]);
    if (index === -1) return sendJson(res, 404, { error: "ไม่พบชุดคำถาม" });
    sets[index] = normalizeSet({ ...body, id: parts[2], createdAt: sets[index].createdAt || new Date().toISOString() });
    writeSets(sets);
    sendJson(res, 200, { set: sets[index] });
    return;
  }

  if (method === "DELETE" && parts[1] === "sets" && parts[2]) {
    const sets = readSets();
    const next = sets.filter((set) => set.id !== parts[2]);
    writeSets(next);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/sessions") {
    const body = await readJson(req);
    const set = readSets().find((item) => item.id === body.setId);
    if (!set) return sendJson(res, 404, { error: "ไม่พบชุดคำถาม" });
    if (!set.questions.length) return sendJson(res, 400, { error: "ชุดนี้ยังไม่มีคำถาม" });
    const pin = createPin();
    const session = {
      pin,
      setId: set.id,
      title: set.title,
      status: "lobby",
      questionIndex: -1,
      questionStartedAt: 0,
      duration: 20,
      timer: null,
      tickTimer: null,
      players: new Map(),
      answerStats: []
    };
    sessions.set(pin, session);
    sendJson(res, 201, { session: publicSession(session, "admin") });
    broadcast(pin, "state", publicSession(session, "screen"));
    return;
  }

  if (method === "GET" && parts[1] === "sessions" && parts[2] && parts[3] === "events") {
    openSse(req, res, parts[2], url);
    return;
  }

  if (method === "GET" && parts[1] === "sessions" && parts[2]) {
    const session = sessions.get(parts[2]);
    if (!session) return sendJson(res, 404, { error: "ไม่พบห้องเกม" });
    sendJson(res, 200, { session: publicSession(session, url.searchParams.get("role") || "player", url.searchParams.get("playerId")) });
    return;
  }

  if (method === "POST" && parts[1] === "sessions" && parts[2] && parts[3] === "join") {
    const session = sessions.get(parts[2]);
    if (!session) return sendJson(res, 404, { error: "ไม่พบห้องเกม" });
    if (session.status !== "lobby") return sendJson(res, 409, { error: "เกมเริ่มแล้ว รอรอบถัดไปนะครับ" });
    const body = await readJson(req);
    const player = {
      id: crypto.randomUUID(),
      nickname: cleanNickname(body.nickname),
      score: 0,
      joinedAt: Date.now(),
      answers: []
    };
    session.players.set(player.id, player);
    broadcast(session.pin, "state", publicSession(session, "screen"));
    sendJson(res, 201, { player, session: publicSession(session, "player", player.id) });
    return;
  }

  if (method === "POST" && parts[1] === "sessions" && parts[2] && parts[3] === "start") {
    const session = sessions.get(parts[2]);
    if (!session) return sendJson(res, 404, { error: "ไม่พบห้องเกม" });
    startQuestion(session, session.questionIndex < 0 ? 0 : session.questionIndex);
    sendJson(res, 200, { session: publicSession(session, "admin") });
    return;
  }

  if (method === "POST" && parts[1] === "sessions" && parts[2] && parts[3] === "next") {
    const session = sessions.get(parts[2]);
    if (!session) return sendJson(res, 404, { error: "ไม่พบห้องเกม" });
    const set = getSet(session);
    const nextIndex = session.questionIndex + 1;
    if (nextIndex >= set.questions.length) {
      endSession(session);
    } else {
      startQuestion(session, nextIndex);
    }
    sendJson(res, 200, { session: publicSession(session, "admin") });
    return;
  }

  if (method === "POST" && parts[1] === "sessions" && parts[2] && parts[3] === "reveal") {
    const session = sessions.get(parts[2]);
    if (!session) return sendJson(res, 404, { error: "ไม่พบห้องเกม" });
    revealQuestion(session);
    sendJson(res, 200, { session: publicSession(session, "admin") });
    return;
  }

  if (method === "POST" && parts[1] === "sessions" && parts[2] && parts[3] === "end") {
    const session = sessions.get(parts[2]);
    if (!session) return sendJson(res, 404, { error: "ไม่พบห้องเกม" });
    endSession(session);
    sendJson(res, 200, { session: publicSession(session, "admin") });
    return;
  }

  if (method === "POST" && parts[1] === "sessions" && parts[2] && parts[3] === "answer") {
    const session = sessions.get(parts[2]);
    if (!session) return sendJson(res, 404, { error: "ไม่พบห้องเกม" });
    const result = await receiveAnswer(req, session);
    sendJson(res, result.statusCode, result.body);
    return;
  }

  sendJson(res, 404, { error: "ไม่พบ API" });
}

function serveStatic(req, res, url) {
  const aliases = {
    "/": "/admin.html",
    "/admin": "/admin.html",
    "/screen": "/screen.html",
    "/play": "/play.html"
  };
  const pathname = aliases[url.pathname] || url.pathname;
  const resolved = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(resolved, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(resolved)] || "application/octet-stream" });
    res.end(content);
  });
}

function readSets() {
  return JSON.parse(fs.readFileSync(SETS_FILE, "utf8"));
}

function writeSets(sets) {
  fs.writeFileSync(SETS_FILE, JSON.stringify(sets, null, 2));
}

function normalizeSet(input) {
  return {
    id: input.id || crypto.randomUUID(),
    title: String(input.title || "ชุดคำถาม").slice(0, 80),
    description: String(input.description || "").slice(0, 240),
    createdAt: input.createdAt || new Date().toISOString(),
    questions: (input.questions || []).map((question) => ({
      id: question.id || crypto.randomUUID(),
      text: String(question.text || "").slice(0, 260),
      image: typeof question.image === "string" ? question.image : "",
      options: [0, 1, 2, 3].map((index) => String((question.options || [])[index] || `ตัวเลือก ${index + 1}`).slice(0, 120)),
      correctIndex: Math.max(0, Math.min(3, Number(question.correctIndex || 0)))
    }))
  };
}

function cleanNickname(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 28);
  return name || `Player ${Math.floor(Math.random() * 9000 + 1000)}`;
}

function createPin() {
  let pin = "";
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (sessions.has(pin));
  return pin;
}

function getSet(session) {
  return readSets().find((set) => set.id === session.setId) || { questions: [], title: session.title };
}

function startQuestion(session, index) {
  clearTimeout(session.timer);
  clearInterval(session.tickTimer);
  session.status = "question";
  session.questionIndex = index;
  session.questionStartedAt = Date.now();
  session.answerStats[index] = [0, 0, 0, 0];
  for (const player of session.players.values()) {
    player.answers = player.answers.filter((answer) => answer.questionIndex !== index);
  }
  session.timer = setTimeout(() => revealQuestion(session), session.duration * 1000);
  session.tickTimer = setInterval(() => {
    if (session.status !== "question") {
      clearInterval(session.tickTimer);
      return;
    }
    broadcast(session.pin, "state", publicSession(session, "screen"));
  }, 1000);
  broadcast(session.pin, "state", publicSession(session, "screen"));
}

function revealQuestion(session) {
  clearTimeout(session.timer);
  clearInterval(session.tickTimer);
  if (session.status === "question") {
    session.status = "reveal";
    broadcast(session.pin, "state", publicSession(session, "screen"));
  }
}

function endSession(session) {
  clearTimeout(session.timer);
  clearInterval(session.tickTimer);
  session.status = "ended";
  broadcast(session.pin, "state", publicSession(session, "screen"));
}

async function receiveAnswer(req, session) {
  if (session.status !== "question") return { statusCode: 409, body: { error: "หมดเวลาตอบข้อนี้แล้ว" } };
  const body = await readJson(req);
  const player = session.players.get(body.playerId);
  if (!player) return { statusCode: 404, body: { error: "ไม่พบผู้เล่น" } };
  const set = getSet(session);
  const question = set.questions[session.questionIndex];
  if (!question) return { statusCode: 404, body: { error: "ไม่พบคำถาม" } };
  if (player.answers.some((answer) => answer.questionIndex === session.questionIndex)) {
    return { statusCode: 409, body: { error: "ตอบข้อนี้ไปแล้ว" } };
  }

  const answerIndex = Math.max(0, Math.min(3, Number(body.answerIndex)));
  const elapsedMs = Math.max(0, Date.now() - session.questionStartedAt);
  const remaining = Math.max(0, session.duration * 1000 - elapsedMs);
  const correct = answerIndex === question.correctIndex;
  const score = correct ? Math.round(500 + 500 * (remaining / (session.duration * 1000))) : 0;
  player.score += score;
  const answer = {
    questionIndex: session.questionIndex,
    answerIndex,
    correct,
    score,
    elapsedMs,
    answeredAt: Date.now()
  };
  player.answers.push(answer);
  session.answerStats[session.questionIndex][answerIndex] += 1;

  const answeredCount = [...session.players.values()].filter((item) =>
    item.answers.some((entry) => entry.questionIndex === session.questionIndex)
  ).length;
  broadcast(session.pin, "state", publicSession(session, "screen"));
  if (answeredCount >= session.players.size && session.players.size > 0) revealQuestion(session);
  return { statusCode: 200, body: { answer, session: publicSession(session, "player", player.id) } };
}

function publicSession(session, role = "player", playerId = "") {
  const set = getSet(session);
  const question = set.questions[session.questionIndex] || null;
  const reveal = session.status === "reveal" || session.status === "ended" || role === "admin";
  const timeRemaining = session.status === "question"
    ? Math.max(0, Math.ceil((session.duration * 1000 - (Date.now() - session.questionStartedAt)) / 1000))
    : session.duration;
  const player = playerId ? session.players.get(playerId) : null;

  return {
    pin: session.pin,
    title: set.title || session.title,
    status: session.status,
    questionIndex: session.questionIndex,
    totalQuestions: set.questions.length,
    duration: session.duration,
    timeRemaining,
    playerCount: session.players.size,
    players: role === "admin" ? [...session.players.values()].map(safePlayer) : undefined,
    leaderboard: leaderboard(session),
    currentQuestion: question ? {
      id: question.id,
      text: question.text,
      image: question.image,
      options: question.options,
      correctIndex: reveal ? question.correctIndex : null,
      stats: reveal || role === "admin" ? session.answerStats[session.questionIndex] || [0, 0, 0, 0] : null
    } : null,
    player: player ? safePlayer(player) : null,
    lastAnswer: player ? player.answers.find((answer) => answer.questionIndex === session.questionIndex) || null : null
  };
}

function safePlayer(player) {
  return {
    id: player.id,
    nickname: player.nickname,
    score: player.score,
    joinedAt: player.joinedAt
  };
}

function leaderboard(session) {
  return [...session.players.values()]
    .map(safePlayer)
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .slice(0, 10);
}

function openSse(req, res, pin, url) {
  const session = sessions.get(pin);
  if (!session) {
    sendJson(res, 404, { error: "ไม่พบห้องเกม" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  const client = {
    res,
    pin,
    role: url.searchParams.get("role") || "player",
    playerId: url.searchParams.get("playerId") || ""
  };
  sseClients.add(client);
  sendEvent(client, "state", publicSession(session, client.role, client.playerId));
  const heartbeat = setInterval(() => {
    try {
      res.write(`: keep-alive ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
}

function broadcast(pin, event, data) {
  for (const client of sseClients) {
    if (client.pin !== pin) continue;
    const session = sessions.get(pin);
    if (!session) continue;
    sendEvent(client, event, publicSession(session, client.role, client.playerId));
  }
}

function sendEvent(client, event, data) {
  client.res.write(`event: ${event}\n`);
  client.res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > BODY_LIMIT) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function getLocalHosts() {
  const hosts = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) hosts.push(entry.address);
    }
  }
  return hosts;
}
