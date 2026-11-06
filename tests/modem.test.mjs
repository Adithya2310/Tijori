import test from 'node:test';
import assert from 'node:assert/strict';
import { initModem, playChallengeTone, stopChallengeTone, startAcousticListener, stopAcousticListener } from '@tijori/client/acoustic-modem';

let lastBuffer, processor, constraints, stopped = 0, permissionRequest;
class AudioContext {
  sampleRate = 48000;
  state = 'running';
  destination = {};
  createBuffer(_channels, length) {
    const samples = new Float32Array(length);
    lastBuffer = samples;
    return { getChannelData: () => samples };
  }
  createBufferSource() {
    return { connect() {}, disconnect() {}, start() { queueMicrotask(() => this.onended()); }, stop() { this.onended(); } };
  }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createScriptProcessor() { processor = { connect() {}, disconnect() {} }; return processor; }
}
globalThis.window = { AudioContext };
Object.defineProperty(globalThis.navigator, 'mediaDevices', { configurable: true, value: {
  getUserMedia: async (value) => {
    constraints = value;
    return permissionRequest ? permissionRequest : { getTracks: () => [{ stop() { stopped++; } }] };
  },
} });

// Measure actual waveform energy, so selecting ultrasound cannot silently keep
// emitting the audible protocol while still passing a decode roundtrip.
function bandEnergy(samples, minHz, maxHz) {
  const size = 2048, start = Math.floor(samples.length / 2);
  const window = Array.from({ length: size }, (_, i) => samples[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1))));
  let energy = 0;
  for (let bin = Math.ceil(minHz * size / 48000); bin <= Math.floor(maxHz * size / 48000); bin++) {
    const coefficient = 2 * Math.cos(2 * Math.PI * bin / size);
    let previous = 0, before = 0;
    for (const sample of window) { const next = sample + coefficient * previous - before; before = previous; previous = next; }
    energy += previous * previous + before * before - coefficient * previous * before;
  }
  return energy;
}

test('real WASM audible and ultrasound waveforms survive Web Audio byte conversions', async () => {
  const modem = await initModem();
  for (const ultrasound of [false, true]) {
    await playChallengeTone('K9X2M4', ultrasound);
    assert.equal(lastBuffer.length / 48000, 1.3226666666666667);
    assert.ok(lastBuffer.some((sample) => sample !== 0));
    assert.ok(lastBuffer.every(Number.isFinite));
    const audibleEnergy = bandEnergy(lastBuffer, 1500, 7000);
    const ultrasoundEnergy = bandEnergy(lastBuffer, 14500, 20000);
    assert.ok(ultrasound ? ultrasoundEnergy > audibleEnergy * 100 : audibleEnergy > ultrasoundEnergy * 100,
      `Expected ${ultrasound ? 'ultrasound' : 'audible'} frequency band, got audible=${audibleEnergy}, ultrasound=${ultrasoundEnergy}`);
    let decoded = '', peak = 0;
    assert.equal(await startAcousticListener((value) => { decoded = value; }, (level) => { peak = Math.max(peak, level); }), true);
    assert.deepEqual(constraints.audio, { echoCancellation: false, autoGainControl: false, noiseSuppression: false });
    for (let i = 0; i < lastBuffer.length; i += 1024) {
      const chunk = new Float32Array(1024);
      chunk.set(lastBuffer.subarray(i, i + 1024));
      processor.onaudioprocess({ inputBuffer: { getChannelData: () => chunk } });
    }
    assert.equal(decoded, 'K9X2M4');
    assert.ok(peak > 0 && peak <= 100);
    stopAcousticListener();
    assert.equal(processor.onaudioprocess, null);
  }
  assert.equal(stopped, 2);
  assert.ok(modem.instance >= 0);
});

test('stop during microphone permission request disposes of the late stream', async () => {
  let resolvePermission;
  permissionRequest = new Promise((resolve) => { resolvePermission = resolve; });
  const pending = startAcousticListener(() => assert.fail('Cancelled listener decoded audio'));
  await new Promise(setImmediate);
  stopAcousticListener();
  resolvePermission({ getTracks: () => [{ stop() { stopped++; } }] });
  assert.equal(await pending, false);
  assert.equal(stopped, 3);
  permissionRequest = null;
});

test('stop cancels playback while modem initialization is pending', async () => {
  const previous = lastBuffer;
  const pending = playChallengeTone('ABC234');
  stopChallengeTone();
  await pending;
  assert.equal(lastBuffer, previous);
  await assert.rejects(playChallengeTone('long payload'), /six-character/);
});
