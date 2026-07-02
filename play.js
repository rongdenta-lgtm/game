const els = {
  joinPanel: document.querySelector("#joinPanel"),
  pinInput: document.querySelector("#pinInput"),
  nameInput: document.querySelector("#nameInput"),
  joinBtn: document.querySelector("#joinBtn"),
  joinError: document.querySelector("#joinError"),
  playerPanel: document.querySelector("#playerPanel"),
  playerName: document.querySelector("#playerName"),
  playerScore: document.querySelector("#playerScore"),
  playerStatus: document.querySelector("#playerStatus"),
  mobileAnswers: document.querySelector("#mobileAnswers"),
  answerFeedback: document.querySelector("#answerFeedback")
};

let playerId = localStorage.getItem("quizPlayerId") || "";
let pin = new URLSearchParams(location.search).get("pin") || "";
let source;
let currentQuestionId = "";

const symbols = ["◆", "●", "▲", "■"];

els.pinInput.value = pin;
els.joinBtn.addEventListener("click", joinGame);
els.nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinGame();
});

async function joinGame() {
  pin = els.pinInput.value.replace(/\D/g, "").slice(0, 6);
  const nickname = els.nameInput.value.trim();
  els.joinError.textContent = "";
  if (pin.length !== 6) {
    els.joinError.textContent = "กรุณาใส่รหัส 6 หลัก";
    return;
  }
  try {
    const data = await api(`/api/sessions/${pin}/join`, {
      method: "POST",
      body: { nickname }
    });
    playerId = data.player.id;
    localStorage.setItem("quizPlayerId", playerId);
    connectEvents();
    render(data.session);
  } catch (error) {
    els.joinError.textContent = error.message;
  }
}

function connectEvents() {
  if (source) source.close();
  source = new EventSource(`/api/sessions/${pin}/events?role=player&playerId=${encodeURIComponent(playerId)}`);
  source.addEventListener("state", (event) => render(JSON.parse(event.data)));
}

function render(session) {
  els.joinPanel.classList.add("hidden");
  els.playerPanel.classList.remove("hidden");
  if (session.player) {
    els.playerName.textContent = session.player.nickname;
    els.playerScore.textContent = `${session.player.score} pts`;
  }

  if (session.status === "lobby") {
    showWaiting(`เข้าห้องแล้ว (${session.playerCount} คน)`);
    return;
  }

  if (session.status === "ended") {
    const rank = session.leaderboard.findIndex((player) => player.id === playerId) + 1;
    showWaiting(rank > 0 && rank <= 5 ? `ยินดีด้วย อันดับ ${rank}` : "จบเกมแล้ว ขอบคุณที่ร่วมเล่น");
    return;
  }

  if (!session.currentQuestion) {
    showWaiting("รอคำถาม");
    return;
  }

  if (currentQuestionId !== session.currentQuestion.id) {
    currentQuestionId = session.currentQuestion.id;
    els.answerFeedback.classList.add("hidden");
  }

  if (session.status === "question") {
    renderAnswerButtons(session);
    return;
  }

  if (session.status === "reveal") {
    renderReveal(session);
  }
}

function renderAnswerButtons(session) {
  const answered = Boolean(session.lastAnswer);
  els.playerStatus.textContent = answered ? "รับคำตอบแล้ว" : "เลือกคำตอบ";
  els.mobileAnswers.classList.remove("hidden");
  els.mobileAnswers.innerHTML = session.currentQuestion.options.map((_, index) => `
    <button class="answer-button c${index}" type="button" data-answer="${index}" ${answered ? "disabled" : ""}>
      ${symbols[index]}
    </button>
  `).join("");
  els.mobileAnswers.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => answer(Number(button.dataset.answer)));
  });
}

function renderReveal(session) {
  els.mobileAnswers.classList.add("hidden");
  if (!session.lastAnswer) {
    showFeedback("หมดเวลา", false);
    return;
  }
  if (session.lastAnswer.correct) {
    showFeedback(`ถูกต้อง +${session.lastAnswer.score}`, true);
  } else {
    showFeedback("ยังไม่ถูกข้อนี้", false);
  }
  els.playerStatus.textContent = "รอข้อถัดไป";
}

async function answer(answerIndex) {
  els.mobileAnswers.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  try {
    const data = await api(`/api/sessions/${pin}/answer`, {
      method: "POST",
      body: { playerId, answerIndex }
    });
    render(data.session);
  } catch (error) {
    showFeedback(error.message, false);
  }
}

function showWaiting(text) {
  els.playerStatus.textContent = text;
  els.mobileAnswers.classList.add("hidden");
  els.answerFeedback.classList.add("hidden");
}

function showFeedback(text, good) {
  els.answerFeedback.textContent = text;
  els.answerFeedback.className = `answer-feedback ${good ? "good" : "bad"}`;
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
