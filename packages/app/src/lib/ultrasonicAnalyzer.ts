// Ultrasonic attack analysis engine
// Uses the Web Audio API (OfflineAudioContext, AnalyserNode) for spectral analysis,
// energy ratio detection, narrowband peak detection, and AM demodulation.
// No external audio processing libraries — pure Web Audio API + typed arrays.

import type { RuleSeverity } from '@forensicate/scanner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UltrasonicFinding {
  ruleId: string;
  severity: RuleSeverity;
  title: string;
  description: string;
  confidence: number; // 0–100
  details: Record<string, number | string>;
}

export interface UltrasonicAnalysisResult {
  sampleRate: number;
  duration: number;
  channelCount: number;
  maxAnalyzableFreq: number;
  findings: UltrasonicFinding[];
  spectrogramData: Float32Array[];
  fftSize: number;
  frequencyResolution: number;
  demodulatedBuffer: AudioBuffer | null;
  overallRisk: 'clean' | 'warning' | 'suspicious' | 'likely-attack';
  overallConfidence: number;
}

export interface AttackPreset {
  id: string;
  name: string;
  description: string;
  carrierFreqHz: number;
  modulationFreqHz: number;
  durationSec: number;
  paper: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPEECH_BAND_LOW = 300;
const SPEECH_BAND_HIGH = 8000;
const ULTRASONIC_THRESHOLD = 18000;
const ENERGY_RATIO_THRESHOLD_DB = -20; // ultrasonic within 20dB of speech = suspicious
const PEAK_PROMINENCE_DB = 15; // narrowband peak must be 15dB above noise floor
const PEAK_PERSISTENCE_RATIO = 0.25; // peak must appear in 25%+ of frames

export const ATTACK_PRESETS: AttackPreset[] = [
  {
    id: 'dolphin-attack',
    name: 'DolphinAttack',
    description: '25.5 kHz AM-modulated carrier exploiting MEMS microphone nonlinearity',
    carrierFreqHz: 25500,
    modulationFreqHz: 800,
    durationSec: 3,
    paper: 'Zhang et al., ACM CCS 2017',
  },
  {
    id: 'nuit',
    name: 'NUIT',
    description: '19.5 kHz near-ultrasonic injection — works through standard speakers',
    carrierFreqHz: 19500,
    modulationFreqHz: 600,
    durationSec: 3,
    paper: 'Xia et al., USENIX Security 2023',
  },
  {
    id: 'surfing-attack',
    name: 'SurfingAttack',
    description: '23 kHz guided ultrasonic wave transmitted through solid surfaces',
    carrierFreqHz: 23000,
    modulationFreqHz: 700,
    durationSec: 3,
    paper: 'Yan et al., NDSS 2020',
  },
  {
    id: 'clean-speech',
    name: 'Clean Speech',
    description: 'Normal 1 kHz speech-band signal for baseline comparison (no attack)',
    carrierFreqHz: 1000,
    modulationFreqHz: 200,
    durationSec: 3,
    paper: 'Control signal',
  },
];

// ---------------------------------------------------------------------------
// FFT Utility (Radix-2 Cooley-Tukey)
// ---------------------------------------------------------------------------

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Butterfly computation
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const tRe = curRe * re[i + j + halfLen] - curIm * im[i + j + halfLen];
        const tIm = curRe * im[i + j + halfLen] + curIm * re[i + j + halfLen];
        re[i + j + halfLen] = re[i + j] - tRe;
        im[i + j + halfLen] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

function computeMagnitudeSpectrum(samples: Float32Array, fftSize: number): Float32Array {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);

  // Apply Hann window and copy samples
  for (let i = 0; i < fftSize; i++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    re[i] = (i < samples.length ? samples[i] : 0) * window;
  }

  fft(re, im);

  // Compute magnitude in dB (only first half — positive frequencies)
  const numBins = fftSize >> 1;
  const magnitude = new Float32Array(numBins);
  for (let i = 0; i < numBins; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / fftSize;
    magnitude[i] = mag > 1e-10 ? 20 * Math.log10(mag) : -100;
  }
  return magnitude;
}

// ---------------------------------------------------------------------------
// Spectrogram computation
// ---------------------------------------------------------------------------

export function computeSpectrogram(
  buffer: AudioBuffer,
  fftSize: number = 4096,
  hopSize?: number,
): Float32Array[] {
  const samples = buffer.getChannelData(0);
  const hop = hopSize ?? (fftSize >> 1); // 50% overlap by default
  const frames: Float32Array[] = [];

  for (let offset = 0; offset + fftSize <= samples.length; offset += hop) {
    const chunk = samples.slice(offset, offset + fftSize);
    frames.push(computeMagnitudeSpectrum(chunk, fftSize));
  }

  return frames;
}

// ---------------------------------------------------------------------------
// Detection: Energy ratio
// ---------------------------------------------------------------------------

function detectEnergyRatio(
  spectrogram: Float32Array[],
  sampleRate: number,
  fftSize: number,
): UltrasonicFinding | null {
  if (spectrogram.length === 0) return null;

  const binWidth = sampleRate / fftSize;
  const speechLow = Math.floor(SPEECH_BAND_LOW / binWidth);
  const speechHigh = Math.min(Math.ceil(SPEECH_BAND_HIGH / binWidth), spectrogram[0].length - 1);
  const ultraLow = Math.floor(ULTRASONIC_THRESHOLD / binWidth);
  const ultraHigh = spectrogram[0].length - 1;

  if (ultraLow >= ultraHigh) return null; // Sample rate too low

  let speechEnergySum = 0;
  let ultraEnergySum = 0;
  let frameCount = 0;

  for (const frame of spectrogram) {
    let speechE = 0, ultraE = 0;
    for (let i = speechLow; i <= speechHigh; i++) {
      speechE += Math.pow(10, frame[i] / 10); // Convert dB to linear power
    }
    for (let i = ultraLow; i <= ultraHigh; i++) {
      ultraE += Math.pow(10, frame[i] / 10);
    }
    speechEnergySum += speechE;
    ultraEnergySum += ultraE;
    frameCount++;
  }

  if (frameCount === 0 || speechEnergySum < 1e-15) return null;

  const ratioDb = 10 * Math.log10(ultraEnergySum / speechEnergySum);

  if (ratioDb > ENERGY_RATIO_THRESHOLD_DB) {
    const confidence = Math.min(100, Math.round(50 + (ratioDb - ENERGY_RATIO_THRESHOLD_DB) * 3));
    return {
      ruleId: 'us-energy-ratio',
      severity: confidence >= 80 ? 'critical' : 'high',
      title: 'High Ultrasonic Energy Detected',
      description: `Ultrasonic band (18–${Math.round(sampleRate / 2000)}kHz) energy is ${ratioDb.toFixed(1)} dB relative to speech band — significantly elevated, consistent with ultrasonic carrier modulation.`,
      confidence,
      details: {
        energyRatioDb: Math.round(ratioDb * 10) / 10,
        speechBandDb: Math.round(10 * Math.log10(speechEnergySum / frameCount) * 10) / 10,
        ultrasonicBandDb: Math.round(10 * Math.log10(ultraEnergySum / frameCount) * 10) / 10,
        thresholdDb: ENERGY_RATIO_THRESHOLD_DB,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Detection: Narrowband peaks
// ---------------------------------------------------------------------------

function detectNarrowbandPeaks(
  spectrogram: Float32Array[],
  sampleRate: number,
  fftSize: number,
): UltrasonicFinding | null {
  if (spectrogram.length === 0) return null;

  const binWidth = sampleRate / fftSize;
  const ultraLow = Math.floor(ULTRASONIC_THRESHOLD / binWidth);
  const numBins = spectrogram[0].length;
  if (ultraLow >= numBins) return null;

  // For each frame, find the peak bin above 18kHz and check prominence
  const peakBinCounts = new Map<number, number>();
  let totalFrames = 0;

  for (const frame of spectrogram) {
    totalFrames++;

    // Compute local noise floor in ultrasonic band
    let sum = 0, count = 0;
    for (let i = ultraLow; i < numBins; i++) {
      sum += frame[i];
      count++;
    }
    const noiseFloor = count > 0 ? sum / count : -100;

    // Find peaks above noise floor
    for (let i = ultraLow + 1; i < numBins - 1; i++) {
      if (frame[i] > frame[i - 1] && frame[i] > frame[i + 1] && frame[i] - noiseFloor > PEAK_PROMINENCE_DB) {
        peakBinCounts.set(i, (peakBinCounts.get(i) ?? 0) + 1);
      }
    }
  }

  // Find the most persistent peak
  let bestBin = -1, bestCount = 0;
  for (const [bin, count] of peakBinCounts) {
    if (count > bestCount) {
      bestBin = bin;
      bestCount = count;
    }
  }

  const persistence = bestCount / totalFrames;
  if (bestBin >= 0 && persistence >= PEAK_PERSISTENCE_RATIO) {
    const peakFreq = bestBin * binWidth;
    const confidence = Math.min(100, Math.round(40 + persistence * 60));
    return {
      ruleId: 'us-narrowband-peak',
      severity: 'critical',
      title: `Tonal Carrier at ${(peakFreq / 1000).toFixed(1)} kHz`,
      description: `Sustained narrowband peak detected at ${peakFreq.toFixed(0)} Hz, present in ${(persistence * 100).toFixed(0)}% of frames. This is consistent with an ultrasonic carrier wave used for AM voice command injection.`,
      confidence,
      details: {
        peakFrequencyHz: Math.round(peakFreq),
        peakFrequencyKHz: `${(peakFreq / 1000).toFixed(1)} kHz`,
        persistencePercent: Math.round(persistence * 100),
        prominenceDb: PEAK_PROMINENCE_DB,
        framesDetected: bestCount,
        totalFrames,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Detection: AM Demodulation
// ---------------------------------------------------------------------------

export async function demodulateAM(
  buffer: AudioBuffer,
  estimatedCarrierHz?: number,
): Promise<{ demodulated: AudioBuffer; finding: UltrasonicFinding | null }> {
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const length = samples.length;

  // If no carrier estimate, use 20kHz as default
  const carrier = estimatedCarrierHz ?? 20000;

  // Step 1: Bandpass filter around estimated carrier (manual IIR)
  // We'll use a simpler approach: multiply by carrier to shift down, then lowpass
  const shifted = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    shifted[i] = samples[i] * Math.cos(2 * Math.PI * carrier * t) * 2;
  }

  // Step 2: Low-pass filter at 4kHz (simple moving average as FIR approximation)
  const cutoff = 4000;
  const filterLen = Math.max(3, Math.round(sampleRate / cutoff));
  const filtered = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    const start = Math.max(0, i - filterLen);
    const end = Math.min(length, i + filterLen + 1);
    for (let j = start; j < end; j++) sum += shifted[j];
    filtered[i] = sum / (end - start);
  }

  // Step 3: Rectify (take absolute value for envelope)
  for (let i = 0; i < length; i++) {
    filtered[i] = Math.abs(filtered[i]);
  }

  // Step 4: Smooth envelope (second low-pass)
  const envelope = new Float32Array(length);
  const smoothLen = Math.max(3, Math.round(sampleRate / 1000)); // ~1kHz smoothing
  for (let i = 0; i < length; i++) {
    let sum = 0;
    const start = Math.max(0, i - smoothLen);
    const end = Math.min(length, i + smoothLen + 1);
    for (let j = start; j < end; j++) sum += filtered[j];
    envelope[i] = sum / (end - start);
  }

  // Create output AudioBuffer
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const outBuffer = ctx.createBuffer(1, length, sampleRate);
  outBuffer.getChannelData(0).set(envelope);

  // Step 5: Check if envelope has speech-like features
  const finding = analyzeSpeechFeatures(envelope, sampleRate);

  return { demodulated: outBuffer, finding };
}

function analyzeSpeechFeatures(
  envelope: Float32Array,
  sampleRate: number,
): UltrasonicFinding | null {
  // Compute spectrum of the demodulated envelope
  const fftSize = 2048;
  const paddedLen = Math.min(envelope.length, fftSize);
  const chunk = envelope.slice(0, paddedLen);
  const spectrum = computeMagnitudeSpectrum(
    chunk.length < fftSize ? new Float32Array([...chunk, ...new Float32Array(fftSize - chunk.length)]) : chunk,
    fftSize,
  );

  const binWidth = sampleRate / fftSize;

  // Measure energy in speech-relevant bands
  const speechLow = Math.floor(200 / binWidth);
  const speechHigh = Math.min(Math.ceil(3400 / binWidth), spectrum.length - 1);
  const subSpeechHigh = Math.floor(100 / binWidth);

  let speechEnergy = 0, totalEnergy = 0, subSpeechEnergy = 0;
  for (let i = 1; i < spectrum.length; i++) {
    const power = Math.pow(10, spectrum[i] / 10);
    totalEnergy += power;
    if (i >= speechLow && i <= speechHigh) speechEnergy += power;
    if (i <= subSpeechHigh) subSpeechEnergy += power;
  }

  if (totalEnergy < 1e-20) return null;

  const speechRatio = speechEnergy / (totalEnergy - subSpeechEnergy + 1e-20);

  // Check dynamic range of envelope (speech has high dynamic range)
  let maxVal = 0, sumSq = 0;
  for (const v of envelope) {
    if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / envelope.length);
  const crestFactor = maxVal / (rms + 1e-15);

  // Speech typically has: speechRatio > 0.3, crest factor > 3
  const isSpeechLike = speechRatio > 0.25 && crestFactor > 2.5;

  if (isSpeechLike) {
    const confidence = Math.min(100, Math.round(30 + speechRatio * 50 + Math.min(crestFactor, 10) * 3));
    return {
      ruleId: 'us-am-demodulation',
      severity: 'critical',
      title: 'Speech Features in Demodulated Signal',
      description: `AM demodulation reveals speech-like features: ${(speechRatio * 100).toFixed(0)}% energy in speech band (200–3400 Hz), crest factor ${crestFactor.toFixed(1)}. This strongly suggests a hidden voice command embedded via amplitude modulation.`,
      confidence,
      details: {
        speechBandRatio: Math.round(speechRatio * 100),
        crestFactor: Math.round(crestFactor * 10) / 10,
        rmsLevel: Math.round(20 * Math.log10(rms + 1e-15) * 10) / 10,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Detection: Sample rate / codec checks
// ---------------------------------------------------------------------------

function checkSampleRateAndCodec(
  sampleRate: number,
  mimeType: string,
  fileName: string,
): UltrasonicFinding[] {
  const findings: UltrasonicFinding[] = [];

  const maxFreq = sampleRate / 2;
  if (maxFreq < 24000) {
    findings.push({
      ruleId: 'us-sample-rate-warning',
      severity: 'low',
      title: `Sample Rate: ${sampleRate} Hz`,
      description: `Maximum analyzable frequency is ${(maxFreq / 1000).toFixed(1)} kHz (Nyquist limit). Ultrasonic attacks using carriers above ${(maxFreq / 1000).toFixed(1)} kHz cannot be detected in this file. For full coverage, use files recorded at 96 kHz or higher.`,
      confidence: 100,
      details: { sampleRate, maxFreqHz: maxFreq, maxFreqKHz: `${(maxFreq / 1000).toFixed(1)} kHz` },
    });
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const lossyFormats = ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma'];
  const lossyMimes = ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg', 'audio/opus', 'audio/x-ms-wma'];
  if (lossyFormats.includes(ext) || lossyMimes.includes(mimeType)) {
    findings.push({
      ruleId: 'us-codec-truncation',
      severity: 'medium',
      title: 'Lossy Audio Codec Detected',
      description: `This file uses a lossy codec (${ext.toUpperCase()}) that typically removes frequencies above 16–18 kHz. Ultrasonic attack evidence may have been stripped during compression. Use WAV or FLAC for reliable analysis.`,
      confidence: 90,
      details: { codec: ext.toUpperCase(), mimeType },
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Main analysis pipeline
// ---------------------------------------------------------------------------

export async function analyzeAudio(
  buffer: AudioBuffer,
  mimeType: string,
  fileName: string,
  fftSize: number = 4096,
): Promise<UltrasonicAnalysisResult> {
  const sampleRate = buffer.sampleRate;
  const findings: UltrasonicFinding[] = [];

  // Step 1: Sample rate / codec checks
  findings.push(...checkSampleRateAndCodec(sampleRate, mimeType, fileName));

  // Step 2: Compute spectrogram
  const spectrogramData = computeSpectrogram(buffer, fftSize);

  // Step 3: Energy ratio detection
  const energyFinding = detectEnergyRatio(spectrogramData, sampleRate, fftSize);
  if (energyFinding) findings.push(energyFinding);

  // Step 4: Narrowband peak detection
  const peakFinding = detectNarrowbandPeaks(spectrogramData, sampleRate, fftSize);
  if (peakFinding) findings.push(peakFinding);

  // Step 5: AM demodulation (use detected peak as carrier estimate, or default 20kHz)
  let demodulatedBuffer: AudioBuffer | null = null;
  const carrierEstimate = peakFinding
    ? (peakFinding.details.peakFrequencyHz as number)
    : undefined;

  // Only attempt demodulation if there's ultrasonic energy worth analyzing
  if (energyFinding || peakFinding) {
    const { demodulated, finding } = await demodulateAM(buffer, carrierEstimate);
    demodulatedBuffer = demodulated;
    if (finding) findings.push(finding);
  }

  // Compute overall risk
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  let overallRisk: UltrasonicAnalysisResult['overallRisk'] = 'clean';
  if (criticalCount >= 2) overallRisk = 'likely-attack';
  else if (criticalCount >= 1 || highCount >= 1) overallRisk = 'suspicious';
  else if (findings.some(f => f.severity === 'medium')) overallRisk = 'warning';

  const maxConfidence = findings.length > 0
    ? Math.max(...findings.map(f => f.confidence))
    : 0;

  return {
    sampleRate,
    duration: buffer.duration,
    channelCount: buffer.numberOfChannels,
    maxAnalyzableFreq: sampleRate / 2,
    findings,
    spectrogramData,
    fftSize,
    frequencyResolution: sampleRate / fftSize,
    demodulatedBuffer,
    overallRisk,
    overallConfidence: maxConfidence,
  };
}

// ---------------------------------------------------------------------------
// Test signal generation
// ---------------------------------------------------------------------------

export async function generateTestSignal(preset: AttackPreset): Promise<AudioBuffer> {
  // Use 48kHz for most presets. For DolphinAttack (25.5kHz carrier),
  // we'd ideally use 96kHz but 48kHz still captures the sidebands below 24kHz
  // and demonstrates the detection concept.
  const sampleRate = preset.carrierFreqHz > 24000 ? 96000 : 48000;
  const length = Math.round(sampleRate * preset.durationSec);
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const carrierFreq = preset.carrierFreqHz;
  const modFreq = preset.modulationFreqHz;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;

    // Modulating signal (simplified speech: sum of a few harmonics)
    const modulation =
      0.4 * Math.sin(2 * Math.PI * modFreq * t) +
      0.3 * Math.sin(2 * Math.PI * modFreq * 1.5 * t) +
      0.2 * Math.sin(2 * Math.PI * modFreq * 2.3 * t) +
      0.1 * Math.sin(2 * Math.PI * modFreq * 3.1 * t);

    // Carrier
    const carrier = Math.cos(2 * Math.PI * carrierFreq * t);

    // AM modulation: s(t) = [1 + m * modulation(t)] * carrier(t)
    const modulationIndex = 0.8;
    data[i] = (1 + modulationIndex * modulation) * carrier;
  }

  // Normalize
  let max = 0;
  for (const v of data) if (Math.abs(v) > max) max = Math.abs(v);
  if (max > 0) for (let i = 0; i < length; i++) data[i] /= max;

  return buffer;
}

// ---------------------------------------------------------------------------
// Live Microphone Monitor
// ---------------------------------------------------------------------------

export interface LiveFrameData {
  frequencyData: Float32Array;     // dB magnitude per bin from AnalyserNode
  sampleRate: number;
  fftSize: number;
  /** Ultrasonic band (18kHz+) RMS energy in dB */
  ultrasonicEnergyDb: number;
  /** Speech band (300–8kHz) RMS energy in dB */
  speechEnergyDb: number;
  /** Energy ratio in dB (ultrasonic - speech) */
  energyRatioDb: number;
  /** Frequency of strongest peak above 18kHz, or null */
  peakFreqHz: number | null;
  /** Peak magnitude in dB */
  peakMagnitudeDb: number;
  /** Whether this frame triggers an alert */
  alert: boolean;
  alertReason: string;
}

export class LiveMonitor {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private rafId: number = 0;
  private _running = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private _recording = false;

  /** Number of consecutive alert frames (for debouncing) */
  private alertStreak = 0;
  private readonly ALERT_STREAK_THRESHOLD = 3;

  get running() { return this._running; }
  get recording() { return this._recording; }

  async start(
    onFrame: (data: LiveFrameData) => void,
    fftSize: number = 4096,
  ): Promise<{ sampleRate: number }> {
    if (this._running) this.stop();

    // Request microphone — prefer high sample rate
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: { ideal: 48000 },
      },
    });

    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    const source = this.audioCtx.createMediaStreamSource(this.stream);

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0.3;
    source.connect(this.analyser);

    const sampleRate = this.audioCtx.sampleRate;
    const numBins = this.analyser.frequencyBinCount;
    const freqData = new Float32Array(numBins);
    const binWidth = sampleRate / fftSize;

    const speechLowBin = Math.floor(SPEECH_BAND_LOW / binWidth);
    const speechHighBin = Math.min(Math.ceil(SPEECH_BAND_HIGH / binWidth), numBins - 1);
    const ultraLowBin = Math.floor(ULTRASONIC_THRESHOLD / binWidth);

    this._running = true;
    this.alertStreak = 0;

    const tick = () => {
      if (!this._running || !this.analyser) return;

      this.analyser.getFloatFrequencyData(freqData);

      // Compute speech band energy
      let speechPower = 0;
      for (let i = speechLowBin; i <= speechHighBin; i++) {
        speechPower += Math.pow(10, freqData[i] / 10);
      }
      const speechDb = 10 * Math.log10(speechPower / Math.max(1, speechHighBin - speechLowBin + 1) + 1e-20);

      // Compute ultrasonic band energy
      let ultraPower = 0;
      let peakBin = -1;
      let peakVal = -Infinity;
      for (let i = ultraLowBin; i < numBins; i++) {
        ultraPower += Math.pow(10, freqData[i] / 10);
        if (freqData[i] > peakVal) {
          peakVal = freqData[i];
          peakBin = i;
        }
      }
      const ultraBins = Math.max(1, numBins - ultraLowBin);
      const ultraDb = 10 * Math.log10(ultraPower / ultraBins + 1e-20);
      const ratioDb = ultraDb - speechDb;

      // Check for narrowband peak
      let noiseFloor = 0;
      for (let i = ultraLowBin; i < numBins; i++) noiseFloor += freqData[i];
      noiseFloor /= ultraBins;
      const peakFreqHz = (peakBin >= ultraLowBin && peakVal - noiseFloor > 10) ? peakBin * binWidth : null;

      // Alert logic
      let alert = false;
      let alertReason = '';
      if (ratioDb > ENERGY_RATIO_THRESHOLD_DB) {
        this.alertStreak++;
      } else if (peakFreqHz !== null && peakVal - noiseFloor > PEAK_PROMINENCE_DB) {
        this.alertStreak++;
      } else {
        this.alertStreak = Math.max(0, this.alertStreak - 1);
      }

      if (this.alertStreak >= this.ALERT_STREAK_THRESHOLD) {
        alert = true;
        if (peakFreqHz !== null) {
          alertReason = `Tonal carrier at ${(peakFreqHz / 1000).toFixed(1)} kHz`;
        } else {
          alertReason = `High ultrasonic energy (${ratioDb.toFixed(0)} dB ratio)`;
        }
      }

      onFrame({
        frequencyData: new Float32Array(freqData),
        sampleRate,
        fftSize,
        ultrasonicEnergyDb: Math.round(ultraDb * 10) / 10,
        speechEnergyDb: Math.round(speechDb * 10) / 10,
        energyRatioDb: Math.round(ratioDb * 10) / 10,
        peakFreqHz,
        peakMagnitudeDb: Math.round(peakVal * 10) / 10,
        alert,
        alertReason,
      });

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
    return { sampleRate };
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this.rafId);
    this.stopRecording();
    this.stream?.getTracks().forEach(t => t.stop());
    this.audioCtx?.close();
    this.stream = null;
    this.audioCtx = null;
    this.analyser = null;
  }

  startRecording() {
    if (!this.stream || this._recording) return;
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(100); // 100ms chunks
    this._recording = true;
  }

  async stopRecording(): Promise<AudioBuffer | null> {
    if (!this.mediaRecorder || !this._recording) return null;
    this._recording = false;

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        if (this.recordedChunks.length === 0) { resolve(null); return; }
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const ctx = new AudioContext({ sampleRate: 48000 });
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          await ctx.close();
          resolve(buffer);
        } catch {
          resolve(null);
        }
      };
      this.mediaRecorder!.stop();
    });
  }
}

// ---------------------------------------------------------------------------
// Audio buffer to WAV blob (for download)
// ---------------------------------------------------------------------------

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const samples = buffer.getChannelData(0);
  const length = samples.length;
  const bytesPerSample = 2; // 16-bit PCM
  const dataLength = length * numChannels * bytesPerSample;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // PCM samples
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += bytesPerSample;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
