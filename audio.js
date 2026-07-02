(() => {
  let context;
  let master;
  let tickTimer;
  let drone;

  window.QuizAudio = {
    start,
    stop,
    hit,
    win
  };

  function ensureContext() {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      master.gain.value = 0.06;
      master.connect(context.destination);
    }
    if (context.state === "suspended") context.resume();
  }

  function start() {
    ensureContext();
    stop();
    drone = context.createOscillator();
    const droneGain = context.createGain();
    drone.type = "sawtooth";
    drone.frequency.value = 74;
    droneGain.gain.value = 0.16;
    drone.connect(droneGain);
    droneGain.connect(master);
    drone.start();
    tickTimer = setInterval(() => tone(880, 0.035, "square", 0.22), 500);
  }

  function stop() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
    if (drone) {
      try { drone.stop(); } catch {}
      drone.disconnect();
    }
    drone = null;
  }

  function hit() {
    ensureContext();
    tone(520, 0.08, "triangle", 0.35);
  }

  function win() {
    ensureContext();
    [440, 554, 659, 880].forEach((freq, index) => {
      setTimeout(() => tone(freq, 0.14, "triangle", 0.5), index * 110);
    });
  }

  function tone(freq, duration, type, gainValue) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration);
  }
})();
