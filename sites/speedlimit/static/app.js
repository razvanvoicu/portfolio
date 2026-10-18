import { DATA_INFO, SPEED_SIGNS, SCHOOL_SIGNS, SG_POLYGONS } from './road-data.js';
import { threshold, isOver, inSingapore, shouldSound, speedKph } from './core.mjs';
import { RoadDriveTracker } from './roads.mjs';
import { ROAD_FEATURES, ROAD_IDENTITIES, NETWORK_INFO } from './network.mjs';

import { CONFIG } from './config.mjs';

const tracker = new RoadDriveTracker(SPEED_SIGNS, CONFIG, SCHOOL_SIGNS, ROAD_FEATURES, ROAD_IDENTITIES);
const $ = id => document.getElementById(id);
let tolerance = 0;
try { const saved = localStorage.getItem('speedlimit.tolerance'); if (saved !== null && Number.isFinite(Number(saved))) tolerance = Math.max(-100, Math.min(100, Number(saved))); } catch {}
let running = false, watch = null, fix = null, wake = null, wakePending = false;
let audio = null, tone = null, volume = null, pulse = null, testUntil = 0, attempt = 0;
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
function alarm(on) {
  if (!audio || !volume) return;
  if (on && audio.state === 'running') {
    if (!pulse) {
      const beep = () => {
        const t = audio.currentTime;
        volume.gain.cancelScheduledValues(t);
        volume.gain.setValueAtTime(0, t);
        volume.gain.linearRampToValueAtTime(0.16, t + 0.008);
        tone.frequency.setValueAtTime(1100, t);
        tone.frequency.setValueAtTime(1650, t + 0.17);
        volume.gain.setValueAtTime(0.16, t + 0.32);
        volume.gain.linearRampToValueAtTime(0, t + 0.34);
      };
      beep(); pulse = setInterval(beep, 420);
    }
  } else {
    clearInterval(pulse); pulse = null;
    volume.gain.cancelScheduledValues(audio.currentTime);
    volume.gain.setValueAtTime(0, audio.currentTime);
  }
}
$('test-sound').onclick = async () => {
  try { await enableAudio(); testUntil = Date.now() + 1000; render(); setTimeout(render, 1000); }
  catch { $('audio-status').textContent = 'Sound unavailable'; }
};
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
function stop() {
  running = false; attempt++;
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null; fix = null; testUntil = 0; tracker.reset();
  if (wake) { wake.release().catch(() => {}); wake = null; }
  alarm(false); message = 'DRIVE STOPPED'; locationError = ''; render();
}
$('start').onclick = async () => {
  if (running) { stop(); return; }
  if (!window.isSecureContext || !navigator.geolocation) { message = 'SECURE LOCATION ACCESS REQUIRED'; render(); return; }
  tracker.reset();
  running = true; fix = null; locationError = ''; message = 'ACQUIRING GPS';
  const token = ++attempt;
  render();
  // Resume audio inside this tap, before waiting for location permission.
  try { await enableAudio(); } catch { /* GPS can still display with a visible audio warning. */ }
  if (!running || token !== attempt) return;
  acquireWake();
  watch = navigator.geolocation.watchPosition(position => {
    if (!running || token !== attempt) return;
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - position.timestamp > CONFIG.maxFixAgeMs || position.timestamp > Date.now() + CONFIG.futureFixToleranceMs) return;
    fix = position; locationError = '';
    const point = [position.coords.longitude, position.coords.latitude];
    if (inSingapore(point, SG_POLYGONS)) tracker.update(point);
    render();
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
  // Display enough precision to make threshold behaviour intelligible. Never
  // round before comparing, so 68.1 is red for a 68 km/h threshold.
  $('speed').textContent = speed === null ? '—' : speed.toFixed(1);
  $('speed').style.fontSize = speed !== null && speed >= 100 ? 'clamp(65px, 28vw, 168px)' : '';
  $('speed').className = `reading ${speed === null || limit === null ? 'neutral' : over ? 'over' : 'good'}`;
  $('speed').setAttribute('aria-label', speed === null ? 'Speed unavailable' : `${speed.toFixed(1)} kilometres per hour`);
  $('limit').textContent = limit ?? '—';
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
  alarm(shouldSound(speed, limit, tolerance, CONFIG) || Date.now() < testUntil);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { acquireWake(); render(); }
  else { fix = null; testUntil = 0; alarm(false); }
});
window.addEventListener('pagehide', stop);
setInterval(() => { if (running || testUntil) render(); }, 500);
setTolerance(tolerance);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {
  $('location-note').textContent = 'Offline installation failed. Keep a network connection and reload to retry.';
});
