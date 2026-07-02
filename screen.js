const els = {
  connectPanel: document.querySelector("#connectPanel"),
  pinInput: document.querySelector("#pinInput"),
  connectBtn: document.querySelector("#connectBtn"),
  gamePanel: document.querySelector("#gamePanel"),
  screenTitle: document.querySelector("#screenTitle"),
  roundLabel: document.querySelector("#roundLabel"),
  screenPin: document.querySelector("#screenPin"),
  lobbyView: document.querySelector("#lobbyView"),
  questionView: document.querySelector("#questionView"),
  winnerView: document.querySelector("#winnerView"),
  screenQr: document.querySelector("#screenQr"),
  screenJoinUrl: document.querySelector("#screenJoinUrl"),
  screenPlayerCount: document.querySelector("#screenPlayerCount"),
  lobbyPlayers: document.querySelector("#lobbyPlayers"),
  timerRing: document.querySelector("#timerRing"),
  questionText: document.querySelector("#questionText"),
  questionImage: document.querySelector("#questionImage"),
  answerGrid: document.querySelector("#answerGrid"),
  winnerList: document.querySelector("#winnerList")
};

let source;
let lastStatus = "";
const symbols = ["◆", "●", "▲", "■"];

els.connectBtn.addEventListener("click", connect);
els.pinInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connect();
});

const initialPin = new URLSearchParams(location.search).get("pin");
if (initialPin) {
  els.pinInput.value = initialPin;
  connect();
}

function connect() {
  const pin = els.pinInput.value.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) return;
  if (source) source.close();
  source = new EventSource(`/api/sessions/${pin}/events?role=screen`);
  source.addEventListener("state", (event) => render(JSON.parse(event.data)));
  source.onerror = () => {
    els.connectBtn.textContent = "ลองอีกครั้ง";
  };
}

function render(session) {
  if (session.status === "question" && lastStatus !== "question") QuizAudio.start();
  if (session.status !== "question" && lastStatus === "question") QuizAudio.stop();
  if (session.status === "ended" && lastStatus !== "ended") QuizAudio.win();
  lastStatus = session.status;

  els.connectPanel.classList.add("hidden");
  els.gamePanel.classList.remove("hidden");
  els.screenPin.textContent = session.pin;
  els.screenTitle.textContent = titleFor(session);
  els.roundLabel.textContent = roundFor(session);

  renderLobby(session);
  renderQuestion(session);
  renderWinners(session);
}

function renderLobby(session) {
  const active = session.status === "lobby";
  els.lobbyView.classList.toggle("hidden", !active);
  if (!active) return;
  const joinUrl = `${location.origin}/play?pin=${session.pin}`;
  drawQr(els.screenQr, joinUrl);
  els.screenJoinUrl.textContent = joinUrl;
  els.screenPlayerCount.textContent = `${session.playerCount} ผู้เล่น`;
  els.lobbyPlayers.innerHTML = session.leaderboard
    .map((player) => `<span class="lobby-chip">${escapeHtml(player.nickname)}</span>`)
    .join("");
}

function renderQuestion(session) {
  const active = session.status === "question" || session.status === "reveal";
  els.questionView.classList.toggle("hidden", !active);
  if (!active || !session.currentQuestion) return;
  const question = session.currentQuestion;
  els.timerRing.textContent = session.status === "question" ? session.timeRemaining : "✓";
  els.questionText.textContent = question.text;
  els.questionImage.classList.toggle("hidden", !question.image);
  if (question.image) els.questionImage.src = question.image;
  els.answerGrid.innerHTML = question.options.map((option, index) => {
    const reveal = question.correctIndex !== null;
    const correct = reveal && index === question.correctIndex;
    const dimmed = reveal && !correct;
    const stat = question.stats ? ` · ${question.stats[index] || 0}` : "";
    return `
      <div class="answer-tile c${index} ${correct ? "correct" : ""} ${dimmed ? "dimmed" : ""}">
        <span class="symbol">${symbols[index]}</span>
        <span>${escapeHtml(option)}${stat}</span>
      </div>
    `;
  }).join("");
}

function renderWinners(session) {
  const active = session.status === "ended";
  els.winnerView.classList.toggle("hidden", !active);
  if (!active) return;
  els.lobbyView.classList.add("hidden");
  els.questionView.classList.add("hidden");
  const winners = session.leaderboard.slice(0, 5);
  els.winnerList.innerHTML = winners.length
    ? winners.map((player, index) => `
      <div class="winner-row">
        <span>#${index + 1}</span>
        <span>${escapeHtml(player.nickname)}</span>
        <strong>${player.score} pts</strong>
      </div>
    `).join("")
    : `<div class="winner-row"><span>-</span><span>ยังไม่มีผู้เล่น</span><strong>0 pts</strong></div>`;
}

function titleFor(session) {
  if (session.status === "lobby") return session.title;
  if (session.status === "ended") return "เชิญผู้ชนะขึ้นรับรางวัล";
  if (session.currentQuestion) return `คำถามที่ ${session.questionIndex + 1}`;
  return session.title;
}

function roundFor(session) {
  if (session.status === "question") return `Question ${session.questionIndex + 1}/${session.totalQuestions}`;
  if (session.status === "reveal") return "Answer";
  if (session.status === "ended") return "Final";
  return "Lobby";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
