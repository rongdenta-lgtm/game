const state = {
  sets: [],
  selectedId: "",
  session: null,
  events: null
};

const els = {
  setList: document.querySelector("#setList"),
  newSetBtn: document.querySelector("#newSetBtn"),
  saveSetBtn: document.querySelector("#saveSetBtn"),
  setTitleView: document.querySelector("#setTitleView"),
  setMeta: document.querySelector("#setMeta"),
  titleInput: document.querySelector("#titleInput"),
  descInput: document.querySelector("#descInput"),
  addQuestionBtn: document.querySelector("#addQuestionBtn"),
  questionEditor: document.querySelector("#questionEditor"),
  createSessionBtn: document.querySelector("#createSessionBtn"),
  roomCard: document.querySelector("#roomCard"),
  sessionBadge: document.querySelector("#sessionBadge"),
  pinView: document.querySelector("#pinView"),
  qrCanvas: document.querySelector("#qrCanvas"),
  joinUrl: document.querySelector("#joinUrl"),
  startBtn: document.querySelector("#startBtn"),
  revealBtn: document.querySelector("#revealBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  endBtn: document.querySelector("#endBtn"),
  playerList: document.querySelector("#playerList")
};

const symbols = ["◆", "●", "▲", "■"];

init();

async function init() {
  bindEvents();
  await loadSets();
}

function bindEvents() {
  els.newSetBtn.addEventListener("click", createNewSet);
  els.saveSetBtn.addEventListener("click", saveSelectedSet);
  els.addQuestionBtn.addEventListener("click", addQuestion);
  els.createSessionBtn.addEventListener("click", createSession);
  els.startBtn.addEventListener("click", () => sessionAction("start"));
  els.revealBtn.addEventListener("click", () => sessionAction("reveal"));
  els.nextBtn.addEventListener("click", () => sessionAction("next"));
  els.endBtn.addEventListener("click", () => sessionAction("end"));
}

async function loadSets() {
  const data = await api("/api/sets");
  state.sets = data.sets;
  if (!state.selectedId && state.sets[0]) state.selectedId = state.sets[0].id;
  renderSets();
  renderEditor();
}

function renderSets() {
  els.setList.innerHTML = "";
  state.sets.forEach((set) => {
    const button = document.createElement("button");
    button.className = `set-item ${set.id === state.selectedId ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `<strong>${escapeHtml(set.title)}</strong><span>${set.questions.length} คำถาม</span>`;
    button.addEventListener("click", () => {
      state.selectedId = set.id;
      renderSets();
      renderEditor();
    });
    els.setList.appendChild(button);
  });
}

function renderEditor() {
  const set = selectedSet();
  if (!set) return;
  els.setTitleView.textContent = set.title;
  els.setMeta.textContent = `${set.questions.length} คำถาม | เวลาข้อละ 20 วินาที`;
  els.titleInput.value = set.title;
  els.descInput.value = set.description || "";
  els.questionEditor.innerHTML = "";
  set.questions.forEach((question, index) => {
    els.questionEditor.appendChild(renderQuestionCard(question, index));
  });
}

function renderQuestionCard(question, index) {
  const card = document.createElement("article");
  card.className = "question-card";
  card.innerHTML = `
    <div class="question-card-head">
      <strong>ข้อ ${index + 1}</strong>
      <button class="small-button" type="button" data-remove>ลบ</button>
    </div>
    <label>คำถาม</label>
    <textarea rows="2" maxlength="260" data-field="text">${escapeHtml(question.text)}</textarea>
    <label style="margin-top:12px">รูปภาพคำถาม</label>
    <input type="file" accept="image/*" data-image>
    ${question.image ? `<img class="image-preview" src="${question.image}" alt="">` : ""}
    <div style="margin-top:12px"></div>
  `;
  const optionsWrap = document.createElement("div");
  question.options.forEach((option, optionIndex) => {
    const row = document.createElement("div");
    row.className = "option-editor";
    row.innerHTML = `
      <span class="option-key c${optionIndex}">${symbols[optionIndex]}</span>
      <input type="text" maxlength="120" value="${escapeHtml(option)}" data-option="${optionIndex}">
      <button class="small-button" type="button" data-correct="${optionIndex}">
        ${question.correctIndex === optionIndex ? "ถูกต้อง" : "ตั้งถูก"}
      </button>
    `;
    optionsWrap.appendChild(row);
  });
  card.appendChild(optionsWrap);

  card.querySelector("[data-field='text']").addEventListener("input", (event) => {
    question.text = event.target.value;
    els.setTitleView.textContent = selectedSet().title;
  });
  card.querySelector("[data-remove]").addEventListener("click", () => {
    selectedSet().questions.splice(index, 1);
    renderEditor();
    renderSets();
  });
  card.querySelector("[data-image]").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    question.image = await fileToDataUrl(file);
    renderEditor();
  });
  card.querySelectorAll("[data-option]").forEach((input) => {
    input.addEventListener("input", (event) => {
      question.options[Number(event.target.dataset.option)] = event.target.value;
    });
  });
  card.querySelectorAll("[data-correct]").forEach((button) => {
    button.addEventListener("click", () => {
      question.correctIndex = Number(button.dataset.correct);
      renderEditor();
    });
  });
  return card;
}

async function createNewSet() {
  const data = await api("/api/sets", {
    method: "POST",
    body: {
      title: "ชุดคำถามใหม่",
      description: "",
      questions: [blankQuestion()]
    }
  });
  state.sets.unshift(data.set);
  state.selectedId = data.set.id;
  renderSets();
  renderEditor();
}

function addQuestion() {
  const set = selectedSet();
  set.questions.push(blankQuestion());
  renderEditor();
  renderSets();
}

async function saveSelectedSet() {
  const set = selectedSet();
  set.title = els.titleInput.value.trim() || "ชุดคำถาม";
  set.description = els.descInput.value.trim();
  const data = await api(`/api/sets/${set.id}`, { method: "PUT", body: set });
  Object.assign(set, data.set);
  renderSets();
  renderEditor();
  flashBadge("บันทึกแล้ว");
}

async function createSession() {
  await saveSelectedSet();
  const data = await api("/api/sessions", {
    method: "POST",
    body: { setId: selectedSet().id }
  });
  state.session = data.session;
  connectEvents();
  renderSession();
}

async function sessionAction(action) {
  if (!state.session) return;
  const data = await api(`/api/sessions/${state.session.pin}/${action}`, { method: "POST", body: {} });
  state.session = data.session;
  renderSession();
}

function connectEvents() {
  if (state.events) state.events.close();
  state.events = new EventSource(`/api/sessions/${state.session.pin}/events?role=admin`);
  state.events.addEventListener("state", (event) => {
    state.session = JSON.parse(event.data);
    renderSession();
  });
}

function renderSession() {
  if (!state.session) return;
  const joinUrl = `${location.origin}/play?pin=${state.session.pin}`;
  els.roomCard.classList.remove("hidden");
  els.pinView.textContent = state.session.pin;
  els.joinUrl.textContent = joinUrl;
  els.sessionBadge.textContent = statusText(state.session);
  drawQr(els.qrCanvas, joinUrl);
  renderPlayers();
}

function renderPlayers() {
  const players = state.session.players || [];
  if (!players.length) {
    els.playerList.className = "player-list empty-state";
    els.playerList.textContent = "ยังไม่มีผู้เล่น";
    return;
  }
  els.playerList.className = "player-list";
  els.playerList.innerHTML = players
    .sort((a, b) => b.score - a.score)
    .map((player) => `<div class="player-row"><span>${escapeHtml(player.nickname)}</span><strong>${player.score}</strong></div>`)
    .join("");
}

function selectedSet() {
  return state.sets.find((set) => set.id === state.selectedId);
}

function blankQuestion() {
  return {
    id: cryptoRandom(),
    text: "",
    image: "",
    options: ["ตัวเลือก 1", "ตัวเลือก 2", "ตัวเลือก 3", "ตัวเลือก 4"],
    correctIndex: 0
  };
}

function cryptoRandom() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function statusText(session) {
  const map = {
    lobby: `Lobby | ${session.playerCount} ผู้เล่น`,
    question: `กำลังตอบ | เหลือ ${session.timeRemaining}s`,
    reveal: "เฉลยแล้ว",
    ended: "จบเกม"
  };
  return map[session.status] || session.status;
}

function flashBadge(text) {
  const old = els.sessionBadge.textContent;
  els.sessionBadge.textContent = text;
  setTimeout(() => {
    els.sessionBadge.textContent = state.session ? statusText(state.session) : old;
  }, 1200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
