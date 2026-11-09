import { DATA_INFO, SPEED_SIGNS, SCHOOL_SIGNS, SG_POLYGONS } from './road-data.js';
import { threshold, isOver, inSingapore, shouldSound, warningLevel, speedKph } from './core.mjs';
import { RoadDriveTracker } from './roads.mjs';
import { ROAD_FEATURES, ROAD_IDENTITIES, NETWORK_INFO } from './network.mjs';

import { CONFIG } from './config.mjs';
import { TripRecorder } from './recording.mjs';

const tracker = new RoadDriveTracker(SPEED_SIGNS, CONFIG, SCHOOL_SIGNS, ROAD_FEATURES, ROAD_IDENTITIES);
const $ = id => document.getElementById(id);
let tolerance = 2;
let gentleExcess = CONFIG.gentleExcessKph;
try { const saved = localStorage.getItem('speedlimit.gentleExcess'); if (saved !== null && Number.isFinite(Number(saved)) && Number(saved) >= 0) gentleExcess = Number(saved); } catch {}
try { const saved = localStorage.getItem('speedlimit.tolerance'); if (saved !== null && Number.isFinite(Number(saved))) tolerance = Math.max(-100, Math.min(100, Number(saved))); } catch {}
let running = false, watch = null, fix = null, wake = null, wakePending = false;
const recorder = new TripRecorder({
  storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
  request: (url, options) => fetch(url, options),
  onStatus(text, failed = false) {
    $('record-status').textContent = text;
    $('retry-recording').hidden = !failed;
  },
});
$('record').checked = recorder.enabled;
$('record-status').textContent = recorder.pending.length ? 'Unsaved recorded rides on this device. Retry the save with Record on.' : recorder.enabled ? 'Recording enabled.' : '';
$('retry-recording').hidden = !recorder.pending.length;
$('retry-recording').disabled = !recorder.enabled;
$('retry-recording').onclick = () => recorder.savePending();
function askRecordingPassword() {
  return new Promise(resolve => {
    const dialog = $('record-password-dialog'), input = $('record-password');
    input.value = '';
    input.type = 'password';
    $('show-record-password').checked = false;
    const finish = value => { dialog.close(); resolve(value); };
    $('record-password-form').onsubmit = event => {
      event.preventDefault();
      if (input.value) finish(input.value);
    };
    $('cancel-record-password').onclick = () => finish(null);
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    dialog.showModal();
    input.focus();
  });
}
$('show-record-password').onchange = () => {
  $('record-password').type = $('show-record-password').checked ? 'text' : 'password';
};
$('record').onchange = async () => {
  if (running) { $('record').checked = recorder.enabled; return; }
  if (!$('record').checked) {
    recorder.disable(); $('retry-recording').disabled = true; return;
  }
  $('record').checked = false;
  $('record').disabled = true;
  $('start').disabled = true;
  try {
    const reuse = recorder.password && window.confirm('Reuse the stored recording password?');
    const password = reuse ? recorder.password : await askRecordingPassword();
    if (password === null) return;
    $('record-status').textContent = 'Checking password…';
    await recorder.enable(password);
    $('record-status').textContent = 'Recording enabled.';
    $('record').checked = true;
    $('retry-recording').disabled = false;
  } catch (error) { $('record-status').textContent = error.message; }
  finally { $('record').disabled = running; $('start').disabled = false; }
};
let audio = null, tone = null, volume = null, pulse = null, testUntil = 0, attempt = 0;
let activeLevel = 'off', testLevel = 'loud';
let message = 'READY WHEN YOU ARE', wakeError = '', locationError = '';
const timeFormat = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium' });
$('data-info').textContent = `${DATA_INFO.signCount.toLocaleString()} speed signs + ${DATA_INFO.schoolSignCount.toLocaleString()} school-zone signs · downloaded ${timeFormat.format(new Date(DATA_INFO.retrieved))}. Singapore Open Data Licence. Complete road coverage is unavailable.`;
$('data-info').textContent += ` Road geometry: ${NETWORK_INFO.geometryDate}; ${NETWORK_INFO.verifiedRoadParts.toLocaleString()} of ${NETWORK_INFO.roadParts.toLocaleString()} parts have mapped legal limits. Other parts use labelled fallback.`;

function setTolerance(value, preserveInput = false) {
  if (!Number.isFinite(value) || value < -100 || value > 100) return;
  tolerance = value;
  if (!preserveInput) $('tolerance').value = String(value);
  $('example').textContent = `For a 70 km/h limit: green up to ${threshold(70, value)}; red above ${threshold(70, value)}.`;
  try { localStorage.setItem('speedlimit.tolerance', String(value)); } catch {}
  render();
}
$('menu').onclick = () => $('settings').showModal();
$('close-settings').onclick = () => $('settings').close();
$('settings').addEventListener('click', event => { if (event.target === $('settings')) { const box = $('settings').getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $('settings').close(); } });
$('tolerance').addEventListener('change', () => {
  const input = $('tolerance');
  if (input.value.trim() === '' || !input.validity.valid) { input.value = String(tolerance); return; }
  setTolerance(Number(input.value));
});
$('tolerance').addEventListener('input', () => {
  const input = $('tolerance');
  if (input.value.trim() !== '' && input.validity.valid) setTolerance(Number(input.value), true);
});
$('minus').onclick = () => setTolerance(Math.max(-100, tolerance - 1));
$('plus').onclick = () => setTolerance(Math.min(100, tolerance + 1));
function setGentleExcess(value) {
  if (!Number.isFinite(value) || value < 0) return;
  gentleExcess = value;
  $('gentle-excess').value = String(value);
  try { localStorage.setItem('speedlimit.gentleExcess', String(value)); } catch {}
  render();
}
$('gentle-minus').onclick = () => setGentleExcess(Math.max(0, gentleExcess - 1));
$('gentle-plus').onclick = () => setGentleExcess(gentleExcess + 1);
$('gentle-excess').value = String(gentleExcess);
$('gentle-excess').addEventListener('change', () => {
  const input = $('gentle-excess'), value = Number(input.value);
  if (input.value.trim() === '' || !input.validity.valid || !Number.isFinite(value) || value < 0) { input.value = String(gentleExcess); return; }
  setGentleExcess(value);
});

async function enableAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('Audio unavailable');
  if (!audio) {
    audio = new Audio();
    tone = audio.createOscillator(); tone.type = 'square'; tone.frequency.value = 1000;
    volume = audio.createGain(); volume.gain.value = 0;
    tone.connect(volume); volume.connect(audio.destination); tone.start();
    audio.addEventListener('statechange', render);
  }
  await audio.resume();
  if (audio.state !== 'running') throw new Error('Audio paused');
}
function alarm(level) {
  if (!audio || !volume) return;
  if (audio.state !== 'running') level = 'off';
  if (level !== activeLevel) {
    clearInterval(pulse); pulse = null;
    volume.gain.cancelScheduledValues(audio.currentTime);
    volume.gain.setValueAtTime(0, audio.currentTime);
    activeLevel = level;
  }
  if (level !== 'off') {
    if (!pulse) {
      const gentle = level === 'gentle';
      tone.type = gentle ? 'sine' : 'square';
      const beep = () => {
        const t = audio.currentTime;
        volume.gain.cancelScheduledValues(t);
        volume.gain.setValueAtTime(0, t);
        volume.gain.linearRampToValueAtTime(gentle ? 0.12 : 0.16, t + (gentle ? 0.04 : 0.008));
        tone.frequency.setValueAtTime(gentle ? 660 : 1100, t);
        tone.frequency.setValueAtTime(gentle ? 880 : 1650, t + 0.17);
        volume.gain.setValueAtTime(gentle ? 0.12 : 0.16, t + 0.32);
        volume.gain.linearRampToValueAtTime(0, t + (gentle ? 0.55 : 0.34));
      };
      beep(); pulse = setInterval(beep, gentle ? 1000 : 420);
    }
  } else {
    clearInterval(pulse); pulse = null;
    volume.gain.cancelScheduledValues(audio.currentTime);
    volume.gain.setValueAtTime(0, audio.currentTime);
  }
}
async function testSound(level) {
  try { await enableAudio(); testLevel = level; testUntil = Date.now() + 1000; render(); setTimeout(render, 1000); }
  catch { $('audio-status').textContent = 'Sound unavailable'; }
}
$('test-sound').onclick = () => testSound('loud');
$('test-gentle').onclick = () => testSound('gentle');
async function acquireWake() {
  if (!running || document.visibilityState !== 'visible' || wake || wakePending) return;
  if (!('wakeLock' in navigator)) { wakeError = 'Screen wake unsupported'; render(); return; }
  wakePending = true;
  try {
    const acquired = await navigator.wakeLock.request('screen');
    if (!running || document.visibilityState !== 'visible') { await acquired.release(); return; }
    wake = acquired; wakeError = '';
    acquired.addEventListener('release', () => { if (wake === acquired) wake = null; render(); });
  } catch { wakeError = 'Screen wake unavailable'; }
  finally { wakePending = false; render(); }
}
function stop(saveRecording = true) {
  running = false; attempt++;
  $('record').disabled = false;
  if (saveRecording) void recorder.stop();
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null; fix = null; testUntil = 0; tracker.reset();
  if (wake) { wake.release().catch(() => {}); wake = null; }
  alarm('off'); message = 'DRIVE STOPPED'; locationError = ''; render();
}
function recordFix(position, processingStatus) {
  const road = tracker.roadMatch.road;
  const mapped = tracker.sign?.kind === 'road' && road?.code === tracker.sign.roadCode && road?.limit === tracker.limit;
  recorder.record(position, {
    // This is the same value render() writes into the speed-limit display.
    speedLimitKph: tracker.limit,
    inference: {
      receivedAt: Date.now(), processingStatus,
      source: tracker.schoolZone ? 'school-zone' : mapped ? 'mapped-road' : tracker.sign ? 'sign' : 'default',
      headingDeg: tracker.heading,
      signId: tracker.sign?.kind === 'road' ? null : tracker.sign?.id ?? null,
      roadMatchState: tracker.roadMatch.state,
      roadCode: road?.code ?? null, roadName: road?.name ?? null,
      roadFeatureId: road?.featureId ?? null, roadLimitKph: road?.limit ?? null,
      roadDistanceM: road?.meters ?? null,
      // Retain these fields for compatibility with pending recordings and the backend.
      schoolZone: Boolean(tracker.schoolZone), manualOverride: false,
      rejectedSignId: null,
    },
  });
}
$('start').onclick = async () => {
  if (running) { stop(); return; }
  if (!window.isSecureContext || !navigator.geolocation) { message = 'SECURE LOCATION ACCESS REQUIRED'; render(); return; }
  tracker.reset();
  running = true; fix = null; locationError = ''; message = 'ACQUIRING GPS';
  $('record').disabled = true;
  recorder.start();
  const token = ++attempt;
  render();
  // Resume audio inside this tap, before waiting for location permission.
  try { await enableAudio(); } catch { /* GPS can still display with a visible audio warning. */ }
  if (!running || token !== attempt) return;
  acquireWake();
  watch = navigator.geolocation.watchPosition(position => {
    if (!running || token !== attempt) return;
    if (document.visibilityState !== 'visible') { recordFix(position, 'background'); return; }
    if (Date.now() - position.timestamp > CONFIG.maxFixAgeMs) { recordFix(position, 'stale'); return; }
    if (position.timestamp > Date.now() + CONFIG.futureFixToleranceMs) { recordFix(position, 'future'); return; }
    fix = position; locationError = '';
    const point = [position.coords.longitude, position.coords.latitude];
    const covered = inSingapore(point, SG_POLYGONS);
    if (covered) tracker.update(point, speedKph(position.coords));
    render();
    recordFix(position, covered ? 'processed' : 'outside-singapore');
  }, error => {
    if (!running || token !== attempt) return;
    fix = null;
    locationError = error.code === 1 ? 'LOCATION DENIED · ENABLE IN BROWSER SETTINGS' : error.code === 2 ? 'GPS UNAVAILABLE' : 'GPS TIMED OUT';
    render();
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
};
function render() {
  let speed = null, info = tracker.sign ? 'Detected sign · retained' : 'Singapore default', note = 'Follow posted road signs. Sound alerts apply at limits of 60 km/h or above.';
  let status = message;
  if (running) {
    status = locationError || 'ACQUIRING GPS';
    if (fix && Date.now() - fix.timestamp <= CONFIG.maxFixAgeMs) {
      const coords = fix.coords, point = [coords.longitude, coords.latitude];
      if (!inSingapore(point, SG_POLYGONS)) {
        status = 'OUTSIDE SINGAPORE'; info = 'Singapore only'; note = 'Monitoring is unavailable outside the Singapore coverage boundary.';
      } else {
        speed = speedKph(coords);
        status = speed === null ? 'GPS SPEED UNAVAILABLE' : 'LIVE · SINGAPORE';
        const road = tracker.roadMatch.road;
        const roadName = road?.name || road?.code;
        const knownRoadLimit = tracker.sign?.kind === 'road' && road?.code === tracker.sign.roadCode && road?.limit === tracker.limit;
        info = tracker.schoolZone ? 'School zone' : knownRoadLimit ? 'Mapped road limit' : tracker.sign ? 'Sign limit · fallback' : '50 km/h default · fallback';
        const heading = tracker.heading === null ? 'Heading pending movement' : `Heading ${Math.round(tracker.heading)}°`;
        const roadStatus = roadName || (tracker.roadMatch.state === 'uncertain' ? 'Road match uncertain' : tracker.roadMatch.state === 'heading' ? 'Road match pending' : 'No road match');
        note = `${roadStatus} · ${heading}${tracker.schoolZone ? ' · 40 km/h until End of School Zone.' : knownRoadLimit ? ' · Statutory road limit.' : ' · Sign/default fallback.'}`;
      }
    } else if (fix) { status = 'GPS SIGNAL LOST'; info = 'Waiting for fresh GPS'; note = 'Speed and alerts paused until a fresh location arrives.'; }
  }
  const limit = tracker.limit;
  const over = isOver(speed, limit, tolerance);
  const level = warningLevel(speed, limit, tolerance, { gentleExcessKph: gentleExcess });
  document.body.classList.toggle('severe', level === 'loud');
  // Display enough precision to make threshold behaviour intelligible. Never
  // round before comparing, so 68.1 is red for a 68 km/h threshold.
  $('speed').textContent = speed === null ? '—' : speed.toFixed(1);
  $('speed').style.fontSize = speed !== null && speed >= 100 ? 'clamp(65px, 28vw, 168px)' : '';
  $('speed').className = `reading ${speed === null || limit === null ? 'neutral' : over ? 'over' : 'good'}`;
  $('speed').setAttribute('aria-label', speed === null ? 'Speed unavailable' : `${speed.toFixed(1)} kilometres per hour`);
  $('limit').textContent = limit ?? '—';
  $('limit').setAttribute('aria-label', `${limit} kilometres per hour`);
  $('status').textContent = status;
  $('dot').className = running && speed !== null ? 'dot active' : 'dot';
  $('alert').textContent = over ? 'SLOW DOWN · ABOVE ALERT THRESHOLD' : speed === null ? 'SINGAPORE SPEED MONITOR' : 'WITHIN ALERT THRESHOLD';
  $('alert').className = `alert${over ? ' over' : ''}`;
  $('threshold').textContent = `${limit < CONFIG.minimumAudibleLimitKph ? 'Colour' : 'Alert'} above ${threshold(limit, tolerance)} km/h${limit < CONFIG.minimumAudibleLimitKph ? ' · silent' : ''}`;
  $('limit-description').textContent = info;
  $('location-note').textContent = note;
  $('start').innerHTML = running ? 'Stop drive <span aria-hidden="true">■</span>' : 'Start drive <span aria-hidden="true">↗</span>';
  $('start').className = `primary${running ? ' running' : ''}`;
  const soundReady = audio?.state === 'running';
  $('audio-status').textContent = running ? soundReady ? 'Sound ready' : 'Sound paused · tap Test in menu' : 'Sound off';
  $('audio-status').className = running && !soundReady ? 'warning' : '';
  $('wake-status').textContent = running ? wake ? 'Screen staying on' : wakeError || 'Screen wake paused' : 'Screen wake off';
  $('wake-status').className = running && !wake ? 'warning' : '';
  alarm(Date.now() < testUntil ? testLevel : shouldSound(speed, limit, tolerance, CONFIG) ? level : 'off');
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { acquireWake(); render(); }
  else { fix = null; testUntil = 0; alarm('off'); }
});
window.addEventListener('pagehide', () => stop(false));
setInterval(() => { if (running || testUntil) render(); }, 500);
setTolerance(tolerance);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {
  $('location-note').textContent = 'Offline installation failed. Keep a network connection and reload to retry.';
});
