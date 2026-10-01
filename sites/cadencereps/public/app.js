const REPS_KEY = "cadencereps:reps";
const PERIOD_KEY = "cadencereps:period";

const MIN_REPS = 1;
const MAX_REPS = 9999;
// The last FLASH seconds of every period are the green flash, so a period
// must be longer than that to leave any time for the fill.
const FLASH = 0.5;
const MIN_PERIOD = 0.6;
const MAX_PERIOD = 999.9;
const START_WARMUP = 1;
const RESUME_WARMUP = 5;

const setupScreen = document.querySelector("#setup");
const repsField = document.querySelector("#reps-field");
const periodField = document.querySelector("#period-field");
const startButton = document.querySelector("#start-button");

const workoutScreen = document.querySelector("#workout");
const clockText = document.querySelector("#clock-text");
const stage = document.querySelector("#stage");
const repNumbers = stage.querySelectorAll(".rep-number");
const fillLayer = document.querySelector("#fill-layer");
const flashLayer = document.querySelector("#flash-layer");
const playButton = document.querySelector("#play-button");
const pauseButton = document.querySelector("#pause-button");
const resumeButton = document.querySelector("#resume-button");
const stopButton = document.querySelector("#stop-button");
const backButton = document.querySelector("#back-button");

// ---------- Setup screen ----------

function parseNumber(raw) {
  const text = raw.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(text) || !/\d/.test(text)) return null;
  return parseFloat(text);
}

function normalizeReps(raw) {
  const value = parseNumber(raw);
  if (value === null) return "";
  return String(Math.min(MAX_REPS, Math.max(MIN_REPS, Math.round(value))));
}

function normalizePeriod(raw) {
  const value = parseNumber(raw);
  if (value === null) return "";
  const tenths = Math.min(MAX_PERIOD * 10, Math.max(MIN_PERIOD * 10, Math.round(value * 10)));
  return (tenths / 10).toFixed(1);
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (e.g. private browsing); values just won't persist.
  }
}

function recall(key) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function updateStartButton() {
  startButton.disabled = parseNumber(repsField.value) === null || parseNumber(periodField.value) === null;
}

// The resolution is only enforced once the field loses focus, so typing
// "2." on the way to "2.5" is never fought over.
function commitField(field, normalize, key) {
  field.value = normalize(field.value);
  store(key, field.value);
  updateStartButton();
}

repsField.addEventListener("blur", () => commitField(repsField, normalizeReps, REPS_KEY));
periodField.addEventListener("blur", () => commitField(periodField, normalizePeriod, PERIOD_KEY));
repsField.addEventListener("input", updateStartButton);
periodField.addEventListener("input", updateStartButton);

repsField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    periodField.focus();
  }
});

periodField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    periodField.blur();
    startWorkout();
  }
});

startButton.addEventListener("click", startWorkout);

function showSetup() {
  cancelFrame();
  releaseWakeLock();
  workoutScreen.hidden = true;
  setupScreen.hidden = false;
}

// ---------- Workout screen ----------

// mode: "ready" (play button shown), "active" (warm-up or counting),
// "paused", or "done".
let mode = "ready";
let targetReps = 0;
let period = 0;
let frame = 0;

// The active timeline, in seconds on the performance.now() clock. A warm-up
// fill runs from warmupStart to anchor; at anchor the first flash shows
// baseCount, and every `period` after that the count goes up by one, flashing.
let warmupStart = 0;
let anchor = 0;
let baseCount = 0;
let hideNumberInWarmup = false;

// Workout time accumulated before the current active stretch. Warm-ups and
// pauses are not counted.
let elapsedBefore = 0;
let count = 0;
let shownNumber = null;

function now() {
  return performance.now() / 1000;
}

function startWorkout() {
  repsField.value = normalizeReps(repsField.value);
  periodField.value = normalizePeriod(periodField.value);
  store(REPS_KEY, repsField.value);
  store(PERIOD_KEY, periodField.value);
  updateStartButton();
  if (startButton.disabled) return;

  targetReps = parseInt(repsField.value, 10);
  period = parseFloat(periodField.value);
  mode = "ready";
  count = 0;
  elapsedBefore = 0;

  setupScreen.hidden = true;
  workoutScreen.hidden = false;
  history.pushState({ workout: true }, "");
  requestWakeLock();

  renderClock(0);
  renderStage("", 0, false);
  renderControls();
}

function beginActive(warmup, hideNumber) {
  mode = "active";
  baseCount = count;
  hideNumberInWarmup = hideNumber;
  warmupStart = now();
  anchor = warmupStart + warmup;
  renderControls();
  tick();
}

function endTime() {
  return anchor + (targetReps - baseCount) * period;
}

// Where the timeline stands at time t, without side effects.
function timelineAt(t) {
  if (t < anchor) {
    return {
      count: baseCount,
      number: hideNumberInWarmup ? "" : String(baseCount),
      fill: (t - warmupStart) / (anchor - warmupStart),
      flash: false,
      finished: false,
    };
  }
  const end = endTime();
  if (t >= end) {
    return { count: targetReps, number: String(targetReps), fill: 0, flash: t < end + FLASH, finished: t >= end + FLASH };
  }
  const beats = Math.floor((t - anchor) / period);
  const phase = t - anchor - beats * period;
  const current = baseCount + beats;
  return {
    count: current,
    number: String(current),
    fill: phase < FLASH ? 0 : (phase - FLASH) / (period - FLASH),
    flash: phase < FLASH,
    finished: false,
  };
}

function activeElapsed(t) {
  return elapsedBefore + Math.max(0, Math.min(t, endTime()) - anchor);
}

function tick() {
  if (mode !== "active") return;
  const t = now();
  const state = timelineAt(t);
  count = state.count;
  renderClock(activeElapsed(t));
  if (state.finished) {
    finish();
    return;
  }
  renderStage(state.number, state.fill, state.flash);
  frame = requestAnimationFrame(tick);
}

function cancelFrame() {
  cancelAnimationFrame(frame);
  frame = 0;
}

function pause() {
  if (mode !== "active") return;
  cancelFrame();
  const t = now();
  const state = timelineAt(t);
  if (state.count >= targetReps) {
    finish();
    return;
  }
  count = state.count;
  elapsedBefore = activeElapsed(t);
  mode = "paused";
  renderClock(elapsedBefore);
  renderStage(String(count), 0, false);
  renderControls();
}

function finish() {
  cancelFrame();
  count = targetReps;
  elapsedBefore = activeElapsed(now());
  mode = "done";
  renderClock(elapsedBefore);
  renderStage(String(count), 0, false);
  renderControls();
  releaseWakeLock();
}

function renderStage(number, fill, flash) {
  if (number !== shownNumber) {
    shownNumber = number;
    for (const element of repNumbers) element.textContent = number;
    stage.style.setProperty("--digits", Math.max(1, number.length));
  }
  const clamped = Math.min(1, Math.max(0, fill));
  fillLayer.style.clipPath = `inset(${((1 - clamped) * 100).toFixed(3)}% 0 0 0)`;
  flashLayer.hidden = !flash;
}

function renderClock(seconds) {
  const whole = Math.floor(seconds);
  const s = whole % 60;
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  const pad = (value) => String(value).padStart(2, "0");
  clockText.textContent = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function renderControls() {
  playButton.hidden = mode !== "ready";
  pauseButton.hidden = mode !== "active";
  resumeButton.hidden = mode !== "paused";
  stopButton.hidden = mode !== "paused";
  backButton.hidden = mode !== "ready" && mode !== "done";
}

playButton.addEventListener("click", () => beginActive(START_WARMUP, true));
pauseButton.addEventListener("click", pause);
resumeButton.addEventListener("click", () => {
  requestWakeLock();
  beginActive(RESUME_WARMUP, false);
});

// Leaving the workout always goes through history, so the phone's own back
// gesture behaves exactly like the Stop and Back buttons.
function leaveWorkout() {
  if (history.state && history.state.workout) {
    history.back();
  } else {
    showSetup();
  }
}

stopButton.addEventListener("click", leaveWorkout);
backButton.addEventListener("click", leaveWorkout);
window.addEventListener("popstate", () => {
  if (!workoutScreen.hidden) showSetup();
});

// ---------- Keep the screen awake while exercising ----------

let wakeLock = null;
let wantWakeLock = false;

async function requestWakeLock() {
  wantWakeLock = true;
  if (!("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    // Not granted (e.g. low battery); the workout still runs.
  }
}

function releaseWakeLock() {
  wantWakeLock = false;
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

// The browser drops the lock whenever the page is hidden.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wantWakeLock) requestWakeLock();
});

// ---------- Startup ----------

// A reload lands on the setup screen, so forget a stale workout entry.
if (history.state && history.state.workout) history.replaceState(null, "");

repsField.value = normalizeReps(recall(REPS_KEY));
periodField.value = normalizePeriod(recall(PERIOD_KEY));
updateStartButton();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

// Best-effort visit tracking, via the shared backend proxied at /stats/.
// Runs once per page load; never blocks or breaks the page on failure.
(function () {
  const STORAGE_KEY = "stats-key";
  let key = null;
  try {
    key = localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (e.g. private browsing); proceed keyless.
  }

  fetch("/stats/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(key ? { key } : {}),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data || !data.key) return;
      try {
        localStorage.setItem(STORAGE_KEY, data.key);
      } catch {
        // ignore
      }
    })
    .catch(() => {});
})();
