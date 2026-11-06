// Acoustic modem: plays and decodes six-character challenges with ggwave over Web Audio.
// Audio never leaves the device; only decoded challenges are sent to the server for matching.
import ggwaveFactory, { type GGWave, type GGWaveInstance } from './vendor/ggwave.js';

type AudioContextConstructor = typeof AudioContext;
let audioContext: AudioContext | null = null;
let ggwave: GGWave | null = null;
let instance: GGWaveInstance | null = null;
let mediaStream: MediaStream | null = null;
let scriptNode: ScriptProcessorNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let activePlaybackSource: AudioBufferSourceNode | null = null;
let initialization: Promise<GGWave> | null = null;
let listenerGeneration = 0;
let playbackGeneration = 0;

type TypedArray = Float32Array | Int8Array | Uint8Array;
function convertTypedArray<T extends TypedArray>(src: TypedArray, type: { new (buffer: ArrayBuffer): T }): T {
 const buffer = new ArrayBuffer(src.byteLength);
 new (src.constructor as { new (buffer: ArrayBuffer): TypedArray })(buffer).set(src);
 return new type(buffer);
}

/** Create or resume the audio context and load ggwave. Call from a user gesture on mobile browsers. */
export async function initModem(): Promise<{ audioContext: AudioContext; ggwave: GGWave; instance: GGWaveInstance }> {
 if (!audioContext) {
  const scope = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  const AudioCtx = scope.AudioContext || scope.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio is unavailable in this browser.');
  audioContext = new AudioCtx({ sampleRate: 48000 });
 }
 if (audioContext.state === 'suspended') await audioContext.resume();
 if (!initialization) initialization = ggwaveFactory().catch(error => { initialization = null; throw error; });
 if (!ggwave) { ggwave = await initialization; ggwave.disableLog(); }
 if (instance === null) {
  const parameters = ggwave.getDefaultParameters();
  parameters.sampleRateInp = audioContext.sampleRate;
  parameters.sampleRateOut = audioContext.sampleRate;
  instance = ggwave.init(parameters);
 }
 return { audioContext, ggwave, instance };
}

/** Play one challenge frame (audible by default, or ultrasound at about 15–19.5 kHz). */
export async function playChallengeTone(nonce: string, useUltrasound = false): Promise<void> {
 if (!/^[A-Z0-9]{6}$/.test(nonce)) throw new Error('Expected a six-character challenge.');
 const generation = ++playbackGeneration;
 const { audioContext: context, ggwave: modem, instance: handle } = await initModem();
 if (generation !== playbackGeneration) return;
 const protocols = modem.ProtocolId || modem.TxProtocolId || {};
 const protocolId = useUltrasound
  ? (protocols.GGWAVE_PROTOCOL_ULTRASOUND_FAST ?? protocols.GGWAVE_TX_PROTOCOL_ULTRASOUND_FAST ?? 4)
  : (protocols.GGWAVE_PROTOCOL_AUDIBLE_FAST ?? protocols.GGWAVE_TX_PROTOCOL_AUDIBLE_FAST ?? 1);
 const waveform = modem.encode(handle, nonce, protocolId, 25);
 const floatSamples = convertTypedArray(waveform, Float32Array);
 const buffer = context.createBuffer(1, floatSamples.length, context.sampleRate);
 buffer.getChannelData(0).set(floatSamples);
 return new Promise(resolve => {
  const source = context.createBufferSource();
  activePlaybackSource = source;
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
   source.disconnect();
   if (activePlaybackSource === source) activePlaybackSource = null;
   resolve();
  };
  source.start(0);
 });
}

export function stopChallengeTone(): void {
 playbackGeneration++;
 if (activePlaybackSource) {
  try { activePlaybackSource.stop(); } catch { /* already stopped */ }
  activePlaybackSource = null;
 }
}

/**
 * Ask for the microphone and decode challenges until stopAcousticListener(). Resolves false when a newer
 * listener or a stop superseded this one before the microphone opened.
 */
export async function startAcousticListener(onDecoded: (value: string) => void, onAudioLevel?: (level: number) => void): Promise<boolean> {
 stopAcousticListener();
 const generation = listenerGeneration;
 const { audioContext: context, ggwave: modem, instance: handle } = await initModem();
 if (generation !== listenerGeneration) return false;
 if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires a secure HTTPS browser context.');
 const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
 if (generation !== listenerGeneration) { stream.getTracks().forEach(track => track.stop()); return false; }
 mediaStream = stream;
 sourceNode = context.createMediaStreamSource(stream);
 scriptNode = context.createScriptProcessor(1024, 1, 1);
 scriptNode.onaudioprocess = event => {
  const channelData = event.inputBuffer.getChannelData(0);
  // RMS for real-time microphone level feedback.
  if (onAudioLevel) {
   let sum = 0;
   for (let i = 0; i < channelData.length; i++) sum += channelData[i] * channelData[i];
   onAudioLevel(Math.min(100, Math.round(Math.sqrt(sum / channelData.length) * 400)));
  }
  const result = modem.decode(handle, convertTypedArray(new Float32Array(channelData), Int8Array));
  if (result && result.length > 0) {
   const decodedText = new TextDecoder('utf-8').decode(result).trim();
   if (decodedText) onDecoded(decodedText);
  }
 };
 sourceNode.connect(scriptNode);
 scriptNode.connect(context.destination);
 return true;
}

export function stopAcousticListener(): void {
 listenerGeneration++;
 if (scriptNode) {
  try { scriptNode.disconnect(); } catch { /* already disconnected */ }
  scriptNode.onaudioprocess = null;
  scriptNode = null;
 }
 if (sourceNode) {
  try { sourceNode.disconnect(); } catch { /* already disconnected */ }
  sourceNode = null;
 }
 if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }
}
