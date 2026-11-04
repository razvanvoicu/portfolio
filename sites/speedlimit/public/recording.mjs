const CHUNK_SIZE = 200;
const PASSWORD_KEY = 'speedlimit.record.password';
const ENABLED_KEY = 'speedlimit.record.enabled';
const PENDING_KEY = 'speedlimit.record.pending';

export class TripRecorder {
  constructor({ storage, request = (...args) => fetch(...args), onStatus = () => {} }) {
    this.storage = storage;
    this.request = request;
    this.onStatus = onStatus;
    this.password = '';
    this.enabled = false;
    this.trip = null;
    this.pending = [];
    this.saving = false;
    try {
      this.password = storage.getItem(PASSWORD_KEY) || '';
      this.enabled = storage.getItem(ENABLED_KEY) === 'true' && Boolean(this.password);
      const pending = JSON.parse(storage.getItem(PENDING_KEY) || '[]');
      if (Array.isArray(pending)) this.pending = pending;
    } catch {}
  }
  async api(path, body, password = this.password) {
    const response = await this.request(`/api/speedlimit/${path}`, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, password }),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Incorrect password.');
      throw new Error('Recording backend unavailable.');
    }
  }
  async enable(password) {
    await this.api('validate', {}, password);
    this.password = password;
    this.enabled = true;
    this.persistSettings();
  }
  disable() {
    this.enabled = false;
    this.persistSettings();
  }
  persistSettings() {
    try {
      this.storage.setItem(PASSWORD_KEY, this.password);
      this.storage.setItem(ENABLED_KEY, String(this.enabled));
    } catch { this.onStatus('Browser storage unavailable; recording settings will not survive a restart.'); }
  }
  persistPending() {
    try { this.storage.setItem(PENDING_KEY, JSON.stringify(this.pending)); return true; }
    catch { return false; }
  }
  start(startedAt = Date.now()) {
    if (!this.enabled) return;
    this.trip = { tripId: `${new Date(startedAt).toISOString()}_${crypto.randomUUID()}`, startedAt, fixes: [] };
    this.onStatus('Recording ride.');
  }
  record(position, display) {
    if (!this.enabled || !this.trip) return;
    const coords = position.coords;
    const fix = { timestamp: position.timestamp };
    for (const key of ['latitude', 'longitude', 'accuracy', 'altitude', 'altitudeAccuracy', 'heading', 'speed']) {
      fix[key] = Number.isFinite(coords[key]) ? coords[key] : null;
    }
    if (display) {
      fix.speedLimitKph = display.speedLimitKph;
      // Every diagnostic field is a primitive; copy now rather than at upload.
      fix.inference = { ...display.inference };
    }
    this.trip.fixes.push(fix);
  }
  stop(stoppedAt = Date.now()) {
    if (!this.enabled || !this.trip) return;
    this.pending.push({ ...this.trip, stoppedAt });
    this.trip = null;
    this.persistPending();
    return this.savePending();
  }
  async savePending() {
    if (!this.enabled || this.saving || !this.pending.length) return;
    this.saving = true;
    this.onStatus('Saving recorded ride…');
    try {
      while (this.enabled && this.pending.length) {
        const trip = this.pending[0];
        const fixCount = trip.fixes.length, chunkCount = Math.max(1, Math.ceil(fixCount / CHUNK_SIZE));
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
          if (!this.enabled) return;
          await this.api('trips', {
            tripId: trip.tripId, startedAt: trip.startedAt, stoppedAt: trip.stoppedAt,
            fixCount, chunkCount, chunkIndex,
            fixes: trip.fixes.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE),
          });
        }
        this.pending.shift();
        this.persistPending();
      }
      this.onStatus(this.trip ? 'Recording ride. Previous ride saved.' : 'Recorded ride saved.');
    } catch (error) {
      const stored = this.persistPending();
      this.onStatus(`${error.message} Ride not saved. ${stored ? 'Retained on this device; retry the save.' : 'Browser storage unavailable; keep this page open and retry the save.'}`, true);
    } finally { this.saving = false; }
  }
}
