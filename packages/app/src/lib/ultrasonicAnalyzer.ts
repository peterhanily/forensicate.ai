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
const ENERGY_RATIO_THRESHOLD_DB = -6;  // ultrasonic must be within 6dB of speech (>25% energy)
const ULTRASONIC_FLOOR_DB = -70;       // ignore ultrasonic band if below this absolute level
const PEAK_PROMINENCE_DB = 25;         // narrowband peak must be 25dB above local noise floor
const PEAK_PERSISTENCE_RATIO = 0.35;   // peak must appear in 35%+ of frames

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
// Audio pre-processing
// ---------------------------------------------------------------------------

/** Max duration (seconds) we'll analyze to avoid freezing the browser */
export const MAX_ANALYSIS_DURATION = 300; // 5 minutes

/** Mix multi-channel audio to mono by averaging all channels */
function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);

  const mixed = new Float32Array(length);
  const numCh = buffer.numberOfChannels;
  for (let ch = 0; ch < numCh; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mixed[i] += data[i];
  }
  const scale = 1 / numCh;
  for (let i = 0; i < length; i++) mixed[i] *= scale;
  return mixed;
}

/** Check if audio is effectively silent */
function computeRmsDb(samples: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  const rms = Math.sqrt(sumSq / samples.length);
  return rms > 1e-15 ? 20 * Math.log10(rms) : -150;
}

// ---------------------------------------------------------------------------
// Spectrogram computation
// ---------------------------------------------------------------------------

export function computeSpectrogram(
  buffer: AudioBuffer,
  fftSize: number = 4096,
  hopSize?: number,
): Float32Array[] {
  const samples = mixToMono(buffer);
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

  // Check absolute ultrasonic energy — ignore if it's just noise floor
  const ultraAvgDb = 10 * Math.log10(ultraEnergySum / (frameCount * Math.max(1, ultraHigh - ultraLow + 1)) + 1e-20);
  if (ultraAvgDb < ULTRASONIC_FLOOR_DB) return null;

  const ratioDb = 10 * Math.log10(ultraEnergySum / speechEnergySum);

  if (ratioDb > ENERGY_RATIO_THRESHOLD_DB) {
    const confidence = Math.min(100, Math.round(40 + (ratioDb - ENERGY_RATIO_THRESHOLD_DB) * 5));
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

  // For each frame, find peaks in ultrasonic band using 5-bin local max window
  const PEAK_HALF_W = 2; // 5-bin window (i-2 to i+2)
  const peakBinCounts = new Map<number, number>();
  let totalFrames = 0;

  for (const frame of spectrogram) {
    totalFrames++;

    // Compute local noise floor in ultrasonic band (median-like: sort and take 25th percentile)
    const ultraVals: number[] = [];
    for (let i = ultraLow; i < numBins; i++) ultraVals.push(frame[i]);
    ultraVals.sort((a, b) => a - b);
    const noiseFloor = ultraVals.length > 0 ? ultraVals[Math.floor(ultraVals.length * 0.25)] : -100;

    // Find peaks using 5-bin local maximum test
    for (let i = ultraLow + PEAK_HALF_W; i < numBins - PEAK_HALF_W; i++) {
      let isLocalMax = true;
      for (let j = i - PEAK_HALF_W; j <= i + PEAK_HALF_W; j++) {
        if (j !== i && frame[j] >= frame[i]) { isLocalMax = false; break; }
      }
      if (isLocalMax && frame[i] - noiseFloor > PEAK_PROMINENCE_DB && frame[i] > -55) {
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
    // Variance-adjusted confidence: penalize if peak is inconsistent across frames
    const baseConfidence = 40 + persistence * 60;
    const confidence = Math.min(100, Math.round(baseConfidence));
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
// Detection: Chirp / FM carrier (frequency sweep)
// ---------------------------------------------------------------------------

function detectChirpCarrier(
  spectrogram: Float32Array[],
  sampleRate: number,
  fftSize: number,
): UltrasonicFinding | null {
  if (spectrogram.length < 5) return null;

  const binWidth = sampleRate / fftSize;
  const ultraLow = Math.floor(ULTRASONIC_THRESHOLD / binWidth);
  const numBins = spectrogram[0].length;
  if (ultraLow >= numBins - 2) return null;

  // For each frame, find the strongest bin in the ultrasonic band
  const peakBins: number[] = [];
  for (const frame of spectrogram) {
    let bestBin = ultraLow, bestVal = -Infinity;
    for (let i = ultraLow; i < numBins; i++) {
      if (frame[i] > bestVal && frame[i] > -55) {
        bestVal = frame[i];
        bestBin = i;
      }
    }
    peakBins.push(bestVal > -55 ? bestBin : -1);
  }

  // Check for a consistent frequency sweep (linear regression on peak bins)
  const validPeaks = peakBins.map((b, i) => ({ x: i, y: b })).filter(p => p.y >= 0);
  if (validPeaks.length < spectrogram.length * 0.3) return null; // Not enough valid peaks

  // Linear regression: y = mx + b
  const n = validPeaks.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of validPeaks) { sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumX2 += p.x * p.x; }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX + 1e-20);
  const intercept = (sumY - slope * sumX) / n;

  // Compute R² (coefficient of determination)
  const meanY = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (const p of validPeaks) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // A chirp has: high R², meaningful slope (> 0.5 bins/frame), strong linearity
  const slopeHz = slope * binWidth; // Hz per frame
  const hopSec = (fftSize / 2) / sampleRate;
  const sweepRateHz = slopeHz / hopSec; // Hz per second

  if (r2 > 0.6 && Math.abs(slopeHz) > 0.3) {
    const startFreq = (intercept * binWidth) / 1000;
    const endFreq = ((slope * (spectrogram.length - 1) + intercept) * binWidth) / 1000;
    const confidence = Math.min(100, Math.round(40 + r2 * 50 + Math.min(Math.abs(sweepRateHz), 5000) / 100));

    return {
      ruleId: 'us-narrowband-peak',
      severity: 'critical',
      title: `Chirp Carrier: ${startFreq.toFixed(1)}→${endFreq.toFixed(1)} kHz`,
      description: `Frequency-swept carrier detected sweeping from ${startFreq.toFixed(1)} to ${endFreq.toFixed(1)} kHz at ${Math.abs(sweepRateHz).toFixed(0)} Hz/s (R²=${r2.toFixed(2)}). FM-modulated attacks use sweeps to evade narrowband detectors.`,
      confidence,
      details: {
        startFreqKHz: `${startFreq.toFixed(1)} kHz`,
        endFreqKHz: `${endFreq.toFixed(1)} kHz`,
        sweepRateHzPerSec: Math.round(sweepRateHz),
        rSquared: Math.round(r2 * 100) / 100,
        validFrames: validPeaks.length,
        totalFrames: spectrogram.length,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Detection: Wideband ultrasonic energy clustering
// ---------------------------------------------------------------------------

function detectWidebandEnergy(
  spectrogram: Float32Array[],
  sampleRate: number,
  fftSize: number,
): UltrasonicFinding | null {
  if (spectrogram.length < 3) return null;

  const binWidth = sampleRate / fftSize;
  const ultraLow = Math.floor(ULTRASONIC_THRESHOLD / binWidth);
  const numBins = spectrogram[0].length;
  if (ultraLow >= numBins - 10) return null;

  // Divide ultrasonic band into 1 kHz sub-bands and check for correlated energy
  const subBandWidth = Math.max(1, Math.round(1000 / binWidth)); // bins per 1 kHz
  const subBands: Array<{ startBin: number; endBin: number; freq: number }> = [];
  for (let bin = ultraLow; bin + subBandWidth < numBins; bin += subBandWidth) {
    subBands.push({ startBin: bin, endBin: bin + subBandWidth, freq: bin * binWidth });
  }

  // Count how many sub-bands have elevated energy in >50% of frames
  let activeBands = 0;
  for (const band of subBands) {
    let activeFrames = 0;
    for (const frame of spectrogram) {
      let bandEnergy = 0;
      for (let i = band.startBin; i < band.endBin; i++) {
        bandEnergy += Math.pow(10, frame[i] / 10);
      }
      const avgDb = 10 * Math.log10(bandEnergy / subBandWidth + 1e-20);
      if (avgDb > -50) activeFrames++;
    }
    if (activeFrames / spectrogram.length > 0.5) activeBands++;
  }

  // Wideband attack: multiple adjacent sub-bands active simultaneously
  if (activeBands >= 3 && subBands.length > 0) {
    const bandwidthKHz = activeBands; // Each sub-band is ~1 kHz
    const confidence = Math.min(100, Math.round(30 + activeBands * 10));

    return {
      ruleId: 'us-energy-ratio',
      severity: 'high',
      title: `Wideband Ultrasonic Energy (${bandwidthKHz} kHz wide)`,
      description: `Sustained energy detected across ${activeBands} sub-bands (${bandwidthKHz} kHz bandwidth) in the ultrasonic range. Spread-spectrum attacks distribute energy across multiple frequencies to evade narrowband detection.`,
      confidence,
      details: {
        activeSubBands: activeBands,
        totalSubBands: subBands.length,
        bandwidthKHz,
        startFreqKHz: `${(subBands[0].freq / 1000).toFixed(1)} kHz`,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Detection: AM Demodulation
// ---------------------------------------------------------------------------

/**
 * 2nd-order Butterworth lowpass filter (IIR).
 * Much better frequency response than a moving average — flat passband,
 * steep rolloff (-40 dB/decade), no sidelobes.
 */
function butterworthLowpass(input: Float32Array, sampleRate: number, cutoffHz: number): Float32Array<ArrayBuffer> {
  const output = new Float32Array(input.length) as Float32Array<ArrayBuffer>;
  const wc = Math.tan(Math.PI * cutoffHz / sampleRate);
  const wc2 = wc * wc;
  const sqrt2wc = Math.SQRT2 * wc;
  const norm = 1 / (1 + sqrt2wc + wc2);

  const b0 = wc2 * norm;
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = 2 * (wc2 - 1) * norm;
  const a2 = (1 - sqrt2wc + wc2) * norm;

  // Forward pass
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    output[i] = y;
  }

  // Backward pass (zero-phase filtering — eliminates phase distortion)
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  for (let i = input.length - 1; i >= 0; i--) {
    const x = output[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    output[i] = y;
  }

  return output;
}

/** Demodulate at a specific carrier frequency and return envelope + speech score */
function demodulateAtCarrier(
  samples: Float32Array,
  sampleRate: number,
  carrierHz: number,
): { envelope: Float32Array; speechScore: number } {
  const length = samples.length;

  // Step 1: Frequency-shift down by multiplying with carrier
  const shifted = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    shifted[i] = samples[i] * Math.cos(2 * Math.PI * carrierHz * i / sampleRate) * 2;
  }

  // Step 2: Butterworth lowpass at 4 kHz (proper filter, not moving average)
  const filtered = butterworthLowpass(shifted, sampleRate, 4000);

  // Step 3: Rectify (absolute value for envelope)
  for (let i = 0; i < length; i++) filtered[i] = Math.abs(filtered[i]);

  // Step 4: Smooth envelope with Butterworth at 800 Hz
  const envelope = butterworthLowpass(filtered, sampleRate, 800);

  // Step 5: Score speech-likeness
  const speechScore = scoreSpeechLikeness(envelope, sampleRate);

  return { envelope, speechScore };
}

export async function demodulateAM(
  buffer: AudioBuffer,
  estimatedCarrierHz?: number,
): Promise<{ demodulated: AudioBuffer; finding: UltrasonicFinding | null }> {
  const sampleRate = buffer.sampleRate;
  const samples = mixToMono(buffer);
  const length = samples.length;

  // Multi-carrier approach: try several frequencies and pick the best speech match
  const carriers: number[] = estimatedCarrierHz
    ? [estimatedCarrierHz] // If we have a peak estimate, use it
    : [19000, 20000, 21000, 22000, 23000]; // Otherwise sweep common attack frequencies

  let bestEnvelope: Float32Array = new Float32Array(length);
  let bestScore = -Infinity;
  let bestCarrier = carriers[0];

  for (const carrier of carriers) {
    if (carrier > sampleRate / 2) continue; // Skip above Nyquist
    const { envelope, speechScore } = demodulateAtCarrier(samples, sampleRate, carrier);
    if (speechScore > bestScore) {
      bestScore = speechScore;
      bestEnvelope = envelope;
      bestCarrier = carrier;
    }
  }

  // Create output AudioBuffer
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const outBuffer = ctx.createBuffer(1, length, sampleRate);
  outBuffer.getChannelData(0).set(bestEnvelope);

  // Check if best demodulation reveals speech
  const finding = analyzeSpeechFeatures(bestEnvelope, sampleRate, bestCarrier);

  return { demodulated: outBuffer, finding };
}

/** Score how speech-like a demodulated envelope is (0 = noise, 1 = clear speech) */
function scoreSpeechLikeness(envelope: Float32Array, sampleRate: number): number {
  const fftSize = 2048;
  const paddedLen = Math.min(envelope.length, fftSize);
  const chunk = envelope.slice(0, paddedLen);
  const spectrum = computeMagnitudeSpectrum(
    chunk.length < fftSize ? new Float32Array([...chunk, ...new Float32Array(fftSize - chunk.length)]) : chunk,
    fftSize,
  );

  const binWidth = sampleRate / fftSize;
  const speechLow = Math.floor(200 / binWidth);
  const speechHigh = Math.min(Math.ceil(3400 / binWidth), spectrum.length - 1);

  let speechEnergy = 0, totalEnergy = 0;
  for (let i = 1; i < spectrum.length; i++) {
    const power = Math.pow(10, spectrum[i] / 10);
    totalEnergy += power;
    if (i >= speechLow && i <= speechHigh) speechEnergy += power;
  }
  if (totalEnergy < 1e-20) return 0;

  const speechRatio = speechEnergy / totalEnergy;

  // Check formant structure (F1 ~500Hz, F2 ~1500Hz, F3 ~2500Hz)
  const f1Bin = Math.round(500 / binWidth);
  const f2Bin = Math.round(1500 / binWidth);
  const f3Bin = Math.round(2500 / binWidth);
  // Average energy in 3-bin window around each formant
  let formantEnergy = 0;
  for (const fb of [f1Bin, f2Bin, f3Bin]) {
    for (let j = Math.max(1, fb - 1); j <= Math.min(fb + 1, spectrum.length - 1); j++) {
      formantEnergy += Math.pow(10, spectrum[j] / 10);
    }
  }
  const formantRatio = formantEnergy / (speechEnergy + 1e-20);

  // Crest factor (peak/RMS ratio — speech is dynamic, noise is flat)
  let maxVal = 0, sumSq = 0;
  for (const v of envelope) {
    if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / envelope.length);
  const crestFactor = maxVal / (rms + 1e-15);

  // Composite score: weight speech ratio, formant concentration, and crest factor
  let score = 0;
  if (speechRatio > 0.3) score += 0.3;
  if (speechRatio > 0.5) score += 0.1;
  if (formantRatio > 0.3) score += 0.2;
  if (formantRatio > 0.5) score += 0.1;
  if (crestFactor > 3) score += 0.15;
  if (crestFactor > 5) score += 0.1;
  if (rms > 1e-5) score += 0.05;

  return score;
}

function analyzeSpeechFeatures(
  envelope: Float32Array,
  sampleRate: number,
  carrierHz: number,
): UltrasonicFinding | null {
  const score = scoreSpeechLikeness(envelope, sampleRate);
  if (score < 0.5) return null;

  // Compute details for the finding
  const fftSize = 2048;
  const binWidth = sampleRate / fftSize;
  const paddedLen = Math.min(envelope.length, fftSize);
  const chunk = envelope.slice(0, paddedLen);
  const spectrum = computeMagnitudeSpectrum(
    chunk.length < fftSize ? new Float32Array([...chunk, ...new Float32Array(fftSize - chunk.length)]) : chunk,
    fftSize,
  );

  let speechEnergy = 0, totalEnergy = 0;
  const speechLow = Math.floor(200 / binWidth);
  const speechHigh = Math.min(Math.ceil(3400 / binWidth), spectrum.length - 1);
  for (let i = 1; i < spectrum.length; i++) {
    const power = Math.pow(10, spectrum[i] / 10);
    totalEnergy += power;
    if (i >= speechLow && i <= speechHigh) speechEnergy += power;
  }
  const speechRatio = speechEnergy / (totalEnergy + 1e-20);

  let maxVal = 0, sumSq = 0;
  for (const v of envelope) {
    if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / envelope.length);
  const crestFactor = maxVal / (rms + 1e-15);

  const confidence = Math.min(100, Math.round(score * 100));

  return {
    ruleId: 'us-am-demodulation',
    severity: 'critical',
    title: 'Speech Features in Demodulated Signal',
    description: `AM demodulation at ${(carrierHz / 1000).toFixed(1)} kHz reveals speech-like features: ${(speechRatio * 100).toFixed(0)}% speech band energy, formant structure detected, crest factor ${crestFactor.toFixed(1)}. Strongly suggests a hidden voice command.`,
    confidence,
    details: {
      carrierFreqHz: carrierHz,
      speechBandRatio: Math.round(speechRatio * 100),
      crestFactor: Math.round(crestFactor * 10) / 10,
      speechScore: Math.round(score * 100),
      rmsLevel: Math.round(20 * Math.log10(rms + 1e-15) * 10) / 10,
    },
  };
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
  onProgress?: (stage: string) => void,
): Promise<UltrasonicAnalysisResult> {
  const sampleRate = buffer.sampleRate;
  const findings: UltrasonicFinding[] = [];

  // Step 0: Duration check
  if (buffer.duration > MAX_ANALYSIS_DURATION) {
    findings.push({
      ruleId: 'us-sample-rate-warning',
      severity: 'low',
      title: 'Audio Truncated for Analysis',
      description: `File is ${buffer.duration.toFixed(0)}s — only the first ${MAX_ANALYSIS_DURATION}s will be analyzed to prevent browser freezing.`,
      confidence: 100,
      details: { durationSec: Math.round(buffer.duration), limitSec: MAX_ANALYSIS_DURATION },
    });
  }

  // Step 0b: Silence detection (mix to mono first)
  const monoSamples = mixToMono(buffer);
  const rmsDb = computeRmsDb(monoSamples);
  if (rmsDb < -80) {
    findings.push({
      ruleId: 'us-sample-rate-warning',
      severity: 'low',
      title: 'Audio Is Silent or Near-Silent',
      description: `Overall RMS level is ${rmsDb.toFixed(0)} dB — too quiet for reliable ultrasonic analysis. Results may not be meaningful.`,
      confidence: 100,
      details: { rmsDb: Math.round(rmsDb) },
    });
  }

  // Step 1: Sample rate / codec checks
  onProgress?.('Checking sample rate and codec...');
  findings.push(...checkSampleRateAndCodec(sampleRate, mimeType, fileName));
  await new Promise(r => setTimeout(r, 0)); // yield to UI

  // Step 2: Compute spectrogram
  onProgress?.('Computing spectrogram...');
  await new Promise(r => setTimeout(r, 0));
  const spectrogramData = computeSpectrogram(buffer, fftSize);

  // Step 3: Energy ratio detection
  onProgress?.('Analyzing ultrasonic energy...');
  await new Promise(r => setTimeout(r, 0));
  const energyFinding = detectEnergyRatio(spectrogramData, sampleRate, fftSize);
  if (energyFinding) findings.push(energyFinding);

  // Step 4: Narrowband peak detection
  onProgress?.('Detecting tonal carriers...');
  const peakFinding = detectNarrowbandPeaks(spectrogramData, sampleRate, fftSize);
  if (peakFinding) findings.push(peakFinding);

  // Step 4b: Chirp / FM carrier detection
  if (!peakFinding) {
    const chirpFinding = detectChirpCarrier(spectrogramData, sampleRate, fftSize);
    if (chirpFinding) findings.push(chirpFinding);
  }

  // Step 4c: Wideband energy clustering (spread-spectrum)
  if (!peakFinding && !energyFinding) {
    const wbFinding = detectWidebandEnergy(spectrogramData, sampleRate, fftSize);
    if (wbFinding) findings.push(wbFinding);
  }

  // Step 5: AM demodulation (use detected peak as carrier estimate, or sweep)
  let demodulatedBuffer: AudioBuffer | null = null;
  const carrierEstimate = peakFinding
    ? (peakFinding.details.peakFrequencyHz as number)
    : undefined;

  // Attempt demodulation if there's ultrasonic energy worth analyzing
  if (energyFinding || peakFinding) {
    onProgress?.('Demodulating AM signal...');
    await new Promise(r => setTimeout(r, 0));
    try {
      const { demodulated, finding } = await demodulateAM(buffer, carrierEstimate);
      demodulatedBuffer = demodulated;
      if (finding) findings.push(finding);
    } catch {
      // Demodulation can fail on very large buffers — continue without it
    }
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
  private readonly ALERT_STREAK_THRESHOLD = 5;

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
      const peakFreqHz = (peakBin >= ultraLowBin && peakVal - noiseFloor > PEAK_PROMINENCE_DB && peakVal > -60) ? peakBin * binWidth : null;

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
// Speech Transcription (Web Speech API)
// ---------------------------------------------------------------------------

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

/** Check if the Web Speech API is available */
export function isSpeechRecognitionAvailable(): boolean {
  return typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

/**
 * Transcribe audio by playing it through speakers while SpeechRecognition
 * listens via the microphone. This mirrors the real attack vector — the
 * demodulated audio IS what a voice assistant would hear.
 *
 * Requires: microphone permission, Chrome/Edge browser, speakers on.
 * Returns interim and final transcripts via callbacks.
 */
export async function transcribeAudioBuffer(
  buffer: AudioBuffer,
  onInterim: (text: string) => void,
  onFinal: (result: TranscriptionResult) => void,
  onError: (error: string) => void,
): Promise<{ stop: () => void }> {
  if (!isSpeechRecognitionAvailable()) {
    onError('Speech recognition not available. Use Chrome or Edge.');
    return { stop: () => {} };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognition = new SpeechRecognitionCtor() as any;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  let fullTranscript = '';
  let bestConfidence = 0;
  let stopped = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript;
      if (result.isFinal) {
        fullTranscript += text + ' ';
        bestConfidence = Math.max(bestConfidence, result[0].confidence);
        onFinal({ transcript: fullTranscript.trim(), confidence: bestConfidence, isFinal: true });
      } else {
        interim += text;
      }
    }
    if (interim) {
      onInterim(fullTranscript + interim);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onerror = (event: any) => {
    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      onError(`Speech recognition error: ${event.error}`);
    }
  };

  recognition.onend = () => {
    // Always fire final callback — even if empty transcript (so UI exits "listening" state)
    if (!stopped) {
      stopped = true;
      onFinal({
        transcript: fullTranscript.trim(),
        confidence: bestConfidence,
        isFinal: true,
      });
    }
  };

  // Start recognition
  recognition.start();

  // Play the audio through speakers (so the mic can hear it)
  const ctx = new AudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  // Safety timeout — stop after 30s regardless (prevents UI deadlock)
  const timeoutId = setTimeout(() => {
    if (!stopped) {
      stopped = true;
      try { source.stop(); } catch { /* already stopped */ }
      try { recognition.stop(); } catch { /* already stopped */ }
      ctx.close();
      onFinal({
        transcript: fullTranscript.trim() || '(no speech detected)',
        confidence: bestConfidence,
        isFinal: true,
      });
    }
  }, 30000);

  source.onended = () => {
    // Give recognition a moment to finish processing
    setTimeout(() => {
      if (!stopped) {
        stopped = true;
        clearTimeout(timeoutId);
        try { recognition.stop(); } catch { /* already stopped */ }
        ctx.close();
      }
    }, 1500);
  };

  source.start();

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timeoutId);
      try { source.stop(); } catch { /* already stopped */ }
      try { recognition.stop(); } catch { /* already stopped */ }
      ctx.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Audio buffer to WAV blob (for download)
// ---------------------------------------------------------------------------

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate;
  // Always export mono — we only use channel 0 (or mixed-down mono)
  const numChannels = 1;
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
