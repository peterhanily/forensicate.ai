import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast';
import { scanPrompt, type ScanResult } from '@forensicate/scanner';
import {
  analyzeAudio,
  generateTestSignal,
  audioBufferToWav,
  LiveMonitor,
  isSpeechRecognitionAvailable,
  transcribeAudioBuffer,
  MAX_ANALYSIS_DURATION,
  ATTACK_PRESETS,
  type UltrasonicAnalysisResult,
  type UltrasonicFinding,
  type AttackPreset,
  type LiveFrameData,
} from '../lib/ultrasonicAnalyzer';

// ============================================================================
// Constants
// ============================================================================

const severityColors: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-green-400',
};

const severityBg: Record<string, string> = {
  critical: 'bg-red-900/30 border-red-800',
  high: 'bg-orange-900/30 border-orange-800',
  medium: 'bg-yellow-900/30 border-yellow-800',
  low: 'bg-green-900/30 border-green-800',
};

const riskColors: Record<string, { text: string; bg: string; label: string }> = {
  'clean': { text: 'text-green-400', bg: 'bg-green-900/30', label: 'Clean' },
  'warning': { text: 'text-yellow-400', bg: 'bg-yellow-900/30', label: 'Warning' },
  'suspicious': { text: 'text-orange-400', bg: 'bg-orange-900/30', label: 'Suspicious' },
  'likely-attack': { text: 'text-red-400', bg: 'bg-red-900/30', label: 'Likely Attack' },
};

const ACCEPTED_AUDIO = '.wav,.flac,.mp3,.ogg,.m4a,.aac,.opus,.webm';

// ============================================================================
// Spectrogram Canvas
// ============================================================================

function SpectrogramCanvas({
  data,
  sampleRate,
  fftSize,
  peakFreqHz,
}: {
  data: Float32Array[];
  sampleRate: number;
  fftSize: number;
  peakFreqHz?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ freq: number; time: number; db: number } | null>(null);

  // Layout constants
  const LABEL_W = 60;
  const BOTTOM_H = 30;
  const HEIGHT = 320;

  // Draw spectrogram (ImageData-based — fast)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length === 0) return;

    const width = container.clientWidth;
    canvas.width = width;
    canvas.height = HEIGHT;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${HEIGHT}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const plotWidth = width - LABEL_W;
    const plotHeight = HEIGHT - BOTTOM_H;
    const numBins = data[0].length;
    const numFrames = data.length;
    const nyquist = sampleRate / 2;

    // Build spectrogram as ImageData (single putImageData call — 100x faster than fillRect per pixel)
    const imgData = ctx.createImageData(plotWidth, plotHeight);
    const pixels = imgData.data;

    for (let px = 0; px < plotWidth; px++) {
      const frameIdx = Math.floor((px / plotWidth) * numFrames);
      const frame = data[Math.min(frameIdx, numFrames - 1)];
      for (let py = 0; py < plotHeight; py++) {
        const binIdx = Math.floor(((plotHeight - 1 - py) / plotHeight) * numBins);
        const db = frame[Math.min(binIdx, numBins - 1)];
        const n = Math.max(0, Math.min(1, (db + 100) / 80));

        // Viridis-inspired colormap: dark purple → blue → green → yellow
        const r = Math.round(n < 0.5 ? n * 2 * 120 : 120 + (n - 0.5) * 2 * 135);
        const g = Math.round(n < 0.25 ? 0 : n < 0.75 ? (n - 0.25) * 2 * 200 : 200 + (n - 0.75) * 4 * 55);
        const b = Math.round(n < 0.5 ? 80 + n * 2 * 100 : 180 - (n - 0.5) * 2 * 180);

        const off = (py * plotWidth + px) * 4;
        pixels[off] = r;
        pixels[off + 1] = g;
        pixels[off + 2] = b;
        pixels[off + 3] = 255;
      }
    }
    ctx.putImageData(imgData, LABEL_W, 0);

    // Background for labels/axes
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, LABEL_W, HEIGHT);
    ctx.fillRect(0, plotHeight, width, BOTTOM_H);

    // Frequency axis labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    const freqLabels = [0, 4000, 8000, 12000, 16000, 20000, 24000].filter(f => f <= nyquist);
    for (const freq of freqLabels) {
      const y = plotHeight - (freq / nyquist) * plotHeight;
      ctx.fillText(`${freq / 1000}k`, LABEL_W - 4, y + 3);
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(LABEL_W, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 18kHz threshold line
    const thresholdY = plotHeight - (18000 / nyquist) * plotHeight;
    if (thresholdY > 0 && thresholdY < plotHeight) {
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(LABEL_W, thresholdY);
      ctx.lineTo(width, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#c9a227';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('18kHz', LABEL_W - 4, thresholdY + 3);
    }

    // Detected peak frequency line
    if (peakFreqHz && peakFreqHz < nyquist) {
      const peakY = plotHeight - (peakFreqHz / nyquist) * plotHeight;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(LABEL_W, peakY);
      ctx.lineTo(width, peakY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${(peakFreqHz / 1000).toFixed(1)}kHz`, LABEL_W + 4, peakY - 4);
    }

    // Time axis
    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'center';
    const hopSize = fftSize / 2;
    const totalDuration = (numFrames * hopSize) / sampleRate;
    const timeSteps = Math.max(1, Math.min(8, Math.floor(totalDuration)));
    for (let t = 0; t <= timeSteps; t++) {
      const sec = (t / timeSteps) * totalDuration;
      const x = LABEL_W + (t / timeSteps) * plotWidth;
      ctx.fillText(`${sec.toFixed(1)}s`, x, HEIGHT - 5);
    }

    // Y-axis title
    ctx.save();
    ctx.translate(12, plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency', 0, 0);
    ctx.restore();
  }, [data, sampleRate, fftSize, peakFreqHz, LABEL_W, BOTTOM_H]);

  // Cursor overlay — separate canvas so we don't redraw spectrogram on every mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const width = container.clientWidth;
    const plotWidth = width - LABEL_W;
    const plotHeight = HEIGHT - BOTTOM_H;
    const nyquist = sampleRate / 2;
    const numFrames = data.length;
    const numBins = data[0].length;
    const hopSize = fftSize / 2;

    if (mx < LABEL_W || mx > width || my < 0 || my > plotHeight) {
      setCursor(null);
      return;
    }

    const freq = ((plotHeight - my) / plotHeight) * nyquist;
    const frameIdx = Math.min(Math.floor(((mx - LABEL_W) / plotWidth) * numFrames), numFrames - 1);
    const binIdx = Math.min(Math.floor(freq / (sampleRate / fftSize)), numBins - 1);
    const db = data[frameIdx][binIdx];
    const time = (frameIdx * hopSize) / sampleRate;

    setCursor({ freq, time, db });

    // Draw crosshairs
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width;
    canvas.height = HEIGHT;
    ctx.clearRect(0, 0, width, HEIGHT);

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(mx, 0);
    ctx.lineTo(mx, plotHeight);
    ctx.moveTo(LABEL_W, my);
    ctx.lineTo(width, my);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [data, sampleRate, fftSize, LABEL_W, BOTTOM_H]);

  const handleMouseLeave = useCallback(() => {
    setCursor(null);
    const canvas = overlayRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  return (
    <div ref={containerRef} className="w-full relative">
      <canvas ref={canvasRef} className="rounded-lg" />
      <canvas
        ref={overlayRef}
        className="absolute top-0 left-0 rounded-lg cursor-crosshair"
        style={{ width: '100%', height: `${HEIGHT}px` }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {cursor && (
        <div className="absolute top-2 right-2 bg-gray-900/90 border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-300 pointer-events-none">
          {(cursor.freq / 1000).toFixed(2)} kHz &middot; {cursor.time.toFixed(2)}s &middot; {cursor.db.toFixed(0)} dB
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Audio Player
// ============================================================================

function AudioPlayer({
  buffer,
  label,
}: {
  buffer: AudioBuffer;
  label: string;
}) {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);

  // Draw waveform on mount
  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement?.clientWidth ?? 300;
    const h = 48;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const samples = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(samples.length / w));

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < w; i++) {
      const idx = i * step;
      const val = samples[idx] ?? 0;
      const y = ((1 - val) / 2) * h;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
  }, [buffer]);

  const play = useCallback(() => {
    if (playing) {
      sourceRef.current?.stop();
      setPlaying(false);
      return;
    }
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => setPlaying(false);
    source.start();
    sourceRef.current = source;
    setPlaying(true);
  }, [buffer, playing]);

  const download = useCallback(() => {
    const blob = audioBufferToWav(buffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${label.toLowerCase().replace(/\s+/g, '-')}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 200);
  }, [buffer, label]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-300 font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {buffer.duration.toFixed(1)}s / {buffer.sampleRate} Hz / {buffer.numberOfChannels}ch
          </span>
          <button
            onClick={download}
            className="text-gray-400 hover:text-[#c9a227] transition-colors"
            title="Download WAV"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={play}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-[#5c0000] border border-[#8b0000] flex items-center justify-center text-[#c9a227] hover:bg-[#8b0000] transition-colors"
        >
          {playing ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <div className="flex-1">
          <canvas ref={waveformRef} className="rounded" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Finding Card
// ============================================================================

function FindingCard({ finding }: { finding: UltrasonicFinding }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border rounded-lg p-3 ${severityBg[finding.severity] ?? 'bg-gray-900 border-gray-700'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${severityColors[finding.severity]} bg-gray-900/50`}>
              {finding.severity.toUpperCase()}
            </span>
            <span className="text-xs text-gray-500 font-mono">{finding.ruleId}</span>
          </div>
          <h4 className="text-sm font-semibold text-gray-200">{finding.title}</h4>
          <p className="text-xs text-gray-400 mt-1">{finding.description}</p>
        </div>
        <div className="flex-shrink-0 ml-3 text-right">
          <div className="text-lg font-bold text-gray-200">{finding.confidence}%</div>
          <div className="text-xs text-gray-500">confidence</div>
        </div>
      </div>
      {Object.keys(finding.details).length > 0 && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-[#c9a227] mt-2 hover:underline">
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      )}
      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-1">
          {Object.entries(finding.details).map(([k, v]) => (
            <div key={k} className="text-xs">
              <span className="text-gray-500">{k}:</span>{' '}
              <span className="text-gray-300 font-mono">{typeof v === 'number' ? v.toFixed(1) : v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Preset Card
// ============================================================================

function PresetCard({
  preset,
  active,
  onSelect,
  disabled,
}: {
  preset: AttackPreset;
  active: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`text-left p-3 rounded-lg border transition-all ${
        active
          ? 'border-[#c9a227] bg-[#c9a227]/10'
          : 'border-gray-700 bg-gray-900 hover:border-gray-500'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-gray-200">{preset.name}</span>
        {preset.id !== 'clean-speech' && (
          <span className="text-xs px-1.5 py-0.5 bg-red-900/30 text-red-400 rounded">Attack</span>
        )}
      </div>
      <p className="text-xs text-gray-400">{preset.description}</p>
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
        <span>{(preset.carrierFreqHz / 1000).toFixed(1)} kHz carrier</span>
        <span>{preset.durationSec}s</span>
      </div>
      <div className="text-xs text-gray-600 mt-1 italic">{preset.paper}</div>
    </button>
  );
}

// ============================================================================
// Live Monitor Panel
// ============================================================================

function LiveMonitorPanel({
  onRecordingComplete,
}: {
  onRecordingComplete: (buffer: AudioBuffer) => void;
}) {
  const { toast } = useToast();
  const monitorRef = useRef<LiveMonitor | null>(null);

  const [active, setActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sampleRate, setSampleRate] = useState(0);
  const [permError, setPermError] = useState<string | null>(null);

  // Recording timer
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live metrics
  const [energyRatio, setEnergyRatio] = useState(-100);
  const [ultraDb, setUltraDb] = useState(-100);
  const [speechDb, setSpeechDb] = useState(-100);
  const [peakFreq, setPeakFreq] = useState<number | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [alertHistory, setAlertHistory] = useState<Array<{ time: string; msg: string }>>([]);

  // Waterfall spectrogram
  const waterfallRef = useRef<HTMLCanvasElement>(null);
  const waterfallContainerRef = useRef<HTMLDivElement>(null);
  const waterfallColumnRef = useRef(0);
  const waterfallImageRef = useRef<ImageData | null>(null);

  // Draw one frame column onto the waterfall canvas
  const drawWaterfallFrame = useCallback((data: LiveFrameData) => {
    const canvas = waterfallRef.current;
    const container = waterfallContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const height = 280;

    // Initialize canvas on first frame or resize
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      waterfallColumnRef.current = 0;
      waterfallImageRef.current = null;
    }

    const numBins = data.frequencyData.length;
    const col = waterfallColumnRef.current;
    const labelW = 50;
    const plotW = width - labelW;

    // Scroll: shift existing image left by 1px
    if (col > 0 && waterfallImageRef.current) {
      ctx.putImageData(waterfallImageRef.current, labelW - 1, 0);
    }

    // Draw new column on the right edge
    const x = labelW + Math.min(col, plotW - 1);
    for (let b = 0; b < numBins; b++) {
      const db = data.frequencyData[b];
      const normalized = Math.max(0, Math.min(1, (db + 100) / 80));
      const r = Math.round(normalized * normalized * 255);
      const g = Math.round(normalized * 200 * (1 - normalized * 0.5));
      const bVal = Math.round((1 - normalized) * 140);
      ctx.fillStyle = `rgb(${r},${g},${bVal})`;
      const y = height - (b / numBins) * height;
      const h = Math.max(1, height / numBins);
      ctx.fillRect(x, y - h, 1, h);
    }

    // Save image for next scroll
    if (col >= plotW - 1) {
      waterfallImageRef.current = ctx.getImageData(labelW, 0, plotW, height);
    }

    // Draw labels every ~60 frames
    if (col % 60 === 0 || col === 0) {
      const nyquist = data.sampleRate / 2;
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, labelW, height);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      const freqs = [0, 4000, 8000, 12000, 16000, 20000, 24000].filter(f => f <= nyquist);
      for (const freq of freqs) {
        const y = height - (freq / nyquist) * height;
        ctx.fillText(`${freq / 1000}k`, labelW - 4, y + 3);
      }

      // 18kHz line
      const threshY = height - (18000 / nyquist) * height;
      if (threshY > 0 && threshY < height) {
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(labelW, threshY);
        ctx.lineTo(width, threshY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    waterfallColumnRef.current = col + 1;
  }, []);

  const handleFrame = useCallback((data: LiveFrameData) => {
    setEnergyRatio(data.energyRatioDb);
    setUltraDb(data.ultrasonicEnergyDb);
    setSpeechDb(data.speechEnergyDb);
    setPeakFreq(data.peakFreqHz);

    if (data.alert) {
      setAlertMsg(data.alertReason);
      setAlertHistory(prev => {
        const entry = { time: new Date().toLocaleTimeString(), msg: data.alertReason };
        const next = [entry, ...prev];
        return next.slice(0, 20); // Keep last 20
      });
    } else {
      setAlertMsg(null);
    }

    drawWaterfallFrame(data);
  }, [drawWaterfallFrame]);

  const startMonitor = useCallback(async () => {
    try {
      setPermError(null);
      const monitor = new LiveMonitor();
      monitorRef.current = monitor;
      const info = await monitor.start(handleFrame);
      setSampleRate(info.sampleRate);
      setActive(true);
      toast(`Microphone active (${info.sampleRate} Hz)`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setPermError('Microphone permission denied. Please allow microphone access and try again.');
      } else {
        setPermError(`Microphone error: ${msg}`);
      }
      toast(`Microphone failed: ${msg}`, 'error');
    }
  }, [handleFrame, toast]);

  const stopMonitor = useCallback(() => {
    monitorRef.current?.stop();
    monitorRef.current = null;
    setActive(false);
    setRecording(false);
    setAlertMsg(null);
    waterfallColumnRef.current = 0;
    waterfallImageRef.current = null;
  }, []);

  const toggleRecording = useCallback(async () => {
    const monitor = monitorRef.current;
    if (!monitor) return;

    if (recording) {
      if (timerRef.current) clearInterval(timerRef.current);
      const buffer = await monitor.stopRecording();
      setRecording(false);
      setRecordingDuration(0);
      if (buffer) {
        toast(`Recorded ${buffer.duration.toFixed(1)}s — ready for analysis`, 'success');
        onRecordingComplete(buffer);
      } else {
        toast('Recording failed — no audio captured', 'error');
      }
    } else {
      monitor.startRecording();
      setRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
      toast('Recording started — press again to stop and analyze', 'info');
    }
  }, [recording, toast, onRecordingComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      monitorRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const ratioColor = energyRatio > -10 ? 'text-red-400' : energyRatio > -20 ? 'text-orange-400' : 'text-green-400';

  return (
    <div className="space-y-4">
      {/* Mic hardware note */}
      <div className="bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 text-xs text-gray-500">
        Most built-in microphones roll off above 18–20 kHz. For best results, use an external USB condenser mic.
        NUIT-class attacks (16–20 kHz) may still be detectable on standard hardware.
        The browser samples at {sampleRate || '48000'} Hz (max {sampleRate ? (sampleRate / 2000).toFixed(1) : '24.0'} kHz).
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {!active ? (
          <button
            onClick={startMonitor}
            className="px-5 py-2 bg-gradient-to-r from-[#8b0000] to-[#5c0000] text-[#c9a227] font-semibold rounded-lg shadow-lg hover:from-[#a00000] hover:to-[#700000] transition-all text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Start Monitoring
          </button>
        ) : (
          <>
            <button
              onClick={stopMonitor}
              className="px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors text-sm"
            >
              Stop
            </button>
            <button
              onClick={toggleRecording}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors ${
                recording
                  ? 'bg-red-700 text-white hover:bg-red-600 animate-pulse'
                  : 'bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${recording ? 'bg-white' : 'bg-red-500'}`} />
              {recording ? `Stop & Analyze (${recordingDuration}s)` : 'Record'}
            </button>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-400">Live</span>
            </div>
          </>
        )}
      </div>

      {permError && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-300">
          {permError}
        </div>
      )}

      {/* Alert Banner */}
      {alertMsg && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 flex items-center gap-3 animate-pulse">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-red-300">Ultrasonic Activity Detected</div>
            <div className="text-xs text-red-400">{alertMsg}</div>
          </div>
        </div>
      )}

      {active && (
        <>
          {/* Live Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
              <div className={`text-xl font-bold font-mono ${ratioColor}`}>
                {energyRatio.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500">US/Speech dB</div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
              <div className="text-xl font-bold font-mono text-gray-300">
                {ultraDb.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500">Ultrasonic dB</div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
              <div className="text-xl font-bold font-mono text-gray-300">
                {speechDb.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500">Speech dB</div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
              <div className="text-xl font-bold font-mono text-gray-300">
                {peakFreq ? `${(peakFreq / 1000).toFixed(1)}k` : '—'}
              </div>
              <div className="text-xs text-gray-500">Peak Freq</div>
            </div>
          </div>

          {/* Waterfall Spectrogram */}
          <div className="bg-gray-950 border border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-300">Live Frequency Waterfall</h3>
              <span className="text-xs text-gray-500">{sampleRate} Hz &middot; 0–{(sampleRate / 2000).toFixed(1)} kHz</span>
            </div>
            <div ref={waterfallContainerRef} className="w-full">
              <canvas ref={waterfallRef} className="rounded-lg bg-gray-950" />
            </div>
          </div>

          {/* Energy Bar Visualization */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Speech Band (300–8k Hz)</span>
                <span className="text-gray-400 font-mono">{speechDb.toFixed(0)} dB</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-100"
                  style={{ width: `${Math.max(0, Math.min(100, (speechDb + 100) * 1.2))}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Ultrasonic Band (18k+ Hz)</span>
                <span className={`font-mono ${energyRatio > -20 ? 'text-red-400' : 'text-gray-400'}`}>{ultraDb.toFixed(0)} dB</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-100 ${energyRatio > -20 ? 'bg-red-500' : energyRatio > -40 ? 'bg-orange-500' : 'bg-green-600'}`}
                  style={{ width: `${Math.max(0, Math.min(100, (ultraDb + 100) * 1.2))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Alert History */}
          {alertHistory.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-300">Alert History</h3>
                <button onClick={() => setAlertHistory([])} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {alertHistory.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-600 font-mono flex-shrink-0">{entry.time}</span>
                    <span className="text-red-400">{entry.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Transcription + Prompt Scan Panel
// ============================================================================

function TranscriptionPanel({
  audioBuffer,
  demodulatedBuffer,
}: {
  audioBuffer: AudioBuffer;
  demodulatedBuffer: AudioBuffer | null;
}) {
  const { toast } = useToast();
  const [transcript, setTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [source, setSource] = useState<'original' | 'demodulated'>('original');
  const [manualText, setManualText] = useState('');
  const stopRef = useRef<(() => void) | null>(null);

  const speechAvailable = isSpeechRecognitionAvailable();

  const startTranscription = useCallback(async () => {
    const buffer = source === 'demodulated' && demodulatedBuffer ? demodulatedBuffer : audioBuffer;
    setIsTranscribing(true);
    setTranscript('');
    setScanResult(null);

    toast('Playing audio through speakers — speech recognition is listening...', 'info');

    const { stop } = await transcribeAudioBuffer(
      buffer,
      (interim) => setTranscript(interim),
      (result) => {
        setTranscript(result.transcript);
        setIsTranscribing(false);
        if (result.transcript.trim()) {
          const scan = scanPrompt(result.transcript);
          setScanResult(scan);
        }
      },
      (err) => {
        toast(err, 'error');
        setIsTranscribing(false);
      },
    );
    stopRef.current = stop;
  }, [audioBuffer, demodulatedBuffer, source, toast]);

  const stopTranscription = useCallback(() => {
    stopRef.current?.();
    setIsTranscribing(false);
  }, []);

  const scanManualText = useCallback(() => {
    if (!manualText.trim()) return;
    setTranscript(manualText.trim());
    const scan = scanPrompt(manualText.trim());
    setScanResult(scan);
  }, [manualText]);

  // Cleanup on unmount
  useEffect(() => { return () => { stopRef.current?.(); }; }, []);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Audio Transcription + Prompt Scan</h3>
        <p className="text-xs text-gray-500">
          Transcribe audio to text, then scan for prompt injection — like OCR for audio.
          {speechAvailable
            ? ' Uses Web Speech API: plays audio through speakers while the mic listens.'
            : ' Web Speech API not available — use manual transcription below.'}
        </p>
      </div>

      {/* Auto-transcription */}
      {speechAvailable && (
        <div className="flex flex-wrap items-center gap-3">
          {demodulatedBuffer && (
            <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5 text-xs">
              <button
                onClick={() => setSource('original')}
                className={`px-2 py-1 rounded ${source === 'original' ? 'bg-gray-700 text-gray-200' : 'text-gray-400'}`}
              >
                Original
              </button>
              <button
                onClick={() => setSource('demodulated')}
                className={`px-2 py-1 rounded ${source === 'demodulated' ? 'bg-gray-700 text-gray-200' : 'text-gray-400'}`}
              >
                Demodulated
              </button>
            </div>
          )}
          {!isTranscribing ? (
            <button
              onClick={startTranscription}
              className="px-4 py-1.5 bg-gradient-to-r from-[#8b0000] to-[#5c0000] text-[#c9a227] font-semibold rounded-lg text-sm hover:from-[#a00000] hover:to-[#700000] transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Transcribe & Scan
            </button>
          ) : (
            <button
              onClick={stopTranscription}
              className="px-4 py-1.5 bg-gray-700 text-gray-200 rounded-lg text-sm flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Stop
            </button>
          )}
          {isTranscribing && (
            <span className="text-xs text-yellow-400 flex items-center gap-1.5">
              <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>
              Listening... (keep speakers on)
            </span>
          )}
        </div>
      )}

      {/* Manual transcription fallback */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">
          {speechAvailable ? 'Or enter transcript manually:' : 'Enter transcript manually:'}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') scanManualText(); }}
            placeholder="Type what you hear (e.g. 'Hey Siri call 911')"
            className="flex-1 bg-gray-950 text-gray-200 text-sm border border-gray-600 rounded-lg px-3 py-1.5 placeholder-gray-600"
          />
          <button
            onClick={scanManualText}
            disabled={!manualText.trim()}
            className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-600 disabled:opacity-40 transition-colors"
          >
            Scan
          </button>
        </div>
      </div>

      {/* Transcript */}
      {transcript && (
        <div className="bg-gray-950 border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Transcript:</div>
          <div className="text-sm text-gray-200 font-mono whitespace-pre-wrap">{transcript}</div>
        </div>
      )}

      {/* Scan Results */}
      {scanResult && (
        <div className={`border rounded-lg p-3 ${scanResult.isPositive ? 'bg-red-900/20 border-red-800' : 'bg-green-900/20 border-green-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            {scanResult.isPositive ? (
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className={`text-sm font-semibold ${scanResult.isPositive ? 'text-red-300' : 'text-green-300'}`}>
              {scanResult.isPositive
                ? `Prompt Injection Detected (${scanResult.confidence}% confidence)`
                : 'No Prompt Injection Detected'}
            </span>
          </div>
          {scanResult.isPositive && (
            <div className="space-y-1 mt-2">
              {scanResult.matchedRules.slice(0, 5).map((rule, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-mono ${severityColors[rule.severity]} bg-gray-900/50`}>
                    {rule.severity}
                  </span>
                  <span className="text-gray-300">{rule.ruleName}</span>
                  <span className="text-gray-600">—</span>
                  <span className="text-gray-400 truncate">{rule.matches[0]}</span>
                </div>
              ))}
              {scanResult.matchedRules.length > 5 && (
                <div className="text-xs text-gray-500">+{scanResult.matchedRules.length - 5} more rules matched</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Educational Section
// ============================================================================

function EducationSection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 text-left flex items-center justify-between bg-gray-900/50 hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-300">How Ultrasonic Voice Attacks Work</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 py-4 text-sm text-gray-400 space-y-4 border-t border-gray-800">
          <div>
            <h4 className="font-semibold text-gray-300 mb-1">The Core Vulnerability: Microphone Nonlinearity</h4>
            <p>MEMS microphones in phones and smart speakers have a physical diaphragm that vibrates at ultrasonic frequencies ({'>'} 20 kHz), even though humans can't hear them. The amplifier circuit in these microphones exhibits <em>nonlinear</em> behavior at high frequencies, which acts as a natural demodulator — it strips the ultrasonic carrier and recovers the baseband voice command.</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-300 mb-1">Amplitude Modulation (AM)</h4>
            <p>Attackers encode a voice command (e.g., "Hey Siri, call 911") onto an ultrasonic carrier wave using AM. The transmitted signal occupies frequencies entirely above 20 kHz — inaudible to humans, but the microphone's nonlinearity demodulates it back into the audible speech that the voice assistant processes.</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-300 mb-1">Attack Families</h4>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>DolphinAttack</strong> (2017) — 25 kHz carrier via ultrasonic transducer, ~1.7m range. Demonstrated on Siri, Alexa, Google Assistant, Cortana.</li>
              <li><strong>NUIT</strong> (2023) — 16–20 kHz near-ultrasound embedded in media. Works through standard laptop/TV speakers — no special hardware needed.</li>
              <li><strong>SurfingAttack</strong> (2020) — Ultrasonic guided waves through solid surfaces (tables). Demonstrated reading SMS codes remotely.</li>
              <li><strong>LipRead</strong> (2018) — Extended range (7–25 feet) via beamforming with transducer arrays.</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-300 mb-1">Detection Approach</h4>
            <p>This analyzer examines the frequency spectrum of audio files for three indicators: (1) elevated energy in the ultrasonic band (18–24 kHz) relative to the speech band, (2) sustained narrowband peaks consistent with carrier waves, and (3) speech-like features in the AM-demodulated envelope. Note: lossy codecs (MP3, AAC) strip ultrasonic content, so use WAV/FLAC for reliable analysis.</p>
          </div>
          <div className="text-xs text-gray-500 border-t border-gray-800 pt-3">
            <strong>Key References:</strong> Zhang et al. "DolphinAttack" (ACM CCS 2017) · Xia et al. "NUIT" (USENIX Security 2023) · Yan et al. "SurfingAttack" (NDSS 2020) · Roy et al. "Inaudible Voice Commands" (INFOCOM 2018) · Sugawara et al. "Light Commands" (USENIX Security 2020)
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

type InputMode = 'upload' | 'generate' | 'live';

export default function UltrasonicAnalyzer() {
  const { toast } = useToast();

  // Input state
  const [inputMode, setInputMode] = useState<InputMode>('generate');
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileMime, setFileMime] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Analysis state
  const [result, setResult] = useState<UltrasonicAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [fftSize, setFftSize] = useState(4096);

  // Drag state
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load audio file
  const loadAudioFile = useCallback(async (file: File) => {
    try {
      setProgress('Decoding audio...');
      setIsAnalyzing(true);
      setResult(null);

      const arrayBuffer = await file.arrayBuffer();
      // Try to create context at high sample rate for better ultrasonic coverage
      let ctx: AudioContext;
      try {
        ctx = new AudioContext({ sampleRate: 96000 });
      } catch {
        ctx = new AudioContext({ sampleRate: 48000 });
      }
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      await ctx.close();

      setAudioBuffer(buffer);
      setFileName(file.name);
      setFileMime(file.type);
      setActivePreset(null);

      const durationMsg = buffer.duration > MAX_ANALYSIS_DURATION
        ? ` (only first ${MAX_ANALYSIS_DURATION}s will be analyzed)`
        : '';
      toast(`Loaded ${file.name} (${buffer.duration.toFixed(1)}s, ${buffer.sampleRate} Hz, ${buffer.numberOfChannels}ch${durationMsg})`, 'success');
    } catch (err) {
      toast(`Failed to decode audio: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setIsAnalyzing(false);
      setProgress('');
    }
  }, [toast]);

  // Generate test signal
  const handleGenerate = useCallback(async (preset: AttackPreset) => {
    try {
      setIsGenerating(true);
      setResult(null);
      setActivePreset(preset.id);

      const buffer = await generateTestSignal(preset);
      setAudioBuffer(buffer);
      setFileName(`${preset.name.toLowerCase().replace(/\s+/g, '-')}-test.wav`);
      setFileMime('audio/wav');
      toast(`Generated ${preset.name} test signal (${buffer.sampleRate} Hz, ${buffer.duration}s)`, 'success');
    } catch (err) {
      toast(`Failed to generate signal: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [toast]);

  // Run analysis
  const handleAnalyze = useCallback(async () => {
    if (!audioBuffer) return;

    try {
      setIsAnalyzing(true);
      setProgress('Starting analysis...');

      // Defer to next frame so UI updates
      await new Promise(r => setTimeout(r, 50));

      const analysisResult = await analyzeAudio(audioBuffer, fileMime, fileName, fftSize, setProgress);
      setResult(analysisResult);

      const riskLabel = riskColors[analysisResult.overallRisk]?.label ?? 'Unknown';
      toast(`Analysis complete: ${riskLabel} (${analysisResult.findings.length} findings)`, analysisResult.overallRisk === 'clean' ? 'success' : 'warning');
    } catch (err) {
      toast(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setIsAnalyzing(false);
      setProgress('');
    }
  }, [audioBuffer, fileMime, fileName, fftSize, toast]);

  // File drop handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadAudioFile(file);
  }, [loadAudioFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadAudioFile(file);
  }, [loadAudioFile]);

  // Detect peak frequency from findings for spectrogram overlay
  const peakFreqHz = result?.findings.find(f => f.ruleId === 'us-narrowband-peak')?.details?.peakFrequencyHz as number | undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[#c9a227]" style={{ fontFamily: 'serif' }}>
          Ultrasonic Attack Analyzer
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          Analyze audio files for inaudible ultrasonic voice commands (DolphinAttack, NUIT, SurfingAttack).
          Visualize the frequency spectrum, detect ultrasonic energy, and demodulate hidden commands.
        </p>
      </div>

      {/* Input Mode Toggle */}
      <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 w-fit border border-gray-700">
        <button
          onClick={() => setInputMode('generate')}
          className={`px-4 py-1.5 rounded text-sm transition-colors ${
            inputMode === 'generate'
              ? 'bg-[#5c0000] text-[#c9a227]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Generate Test Signal
        </button>
        <button
          onClick={() => setInputMode('upload')}
          className={`px-4 py-1.5 rounded text-sm transition-colors ${
            inputMode === 'upload'
              ? 'bg-[#5c0000] text-[#c9a227]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Upload Audio
        </button>
        <button
          onClick={() => setInputMode('live')}
          className={`px-4 py-1.5 rounded text-sm transition-colors flex items-center gap-1.5 ${
            inputMode === 'live'
              ? 'bg-[#5c0000] text-[#c9a227]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Live Monitor
        </button>
      </div>

      {/* Input Section */}
      {inputMode === 'live' ? (
        <LiveMonitorPanel
          onRecordingComplete={(buffer) => {
            setAudioBuffer(buffer);
            setFileName(`mic-recording-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.wav`);
            setFileMime('audio/wav');
            setActivePreset(null);
            setResult(null);
            setInputMode('upload'); // Switch to upload/analyze mode so user can run full analysis
          }}
        />
      ) : inputMode === 'generate' ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Attack Simulation Presets</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ATTACK_PRESETS.map(preset => (
              <PresetCard
                key={preset.id}
                preset={preset}
                active={activePreset === preset.id}
                onSelect={() => handleGenerate(preset)}
                disabled={isGenerating || isAnalyzing}
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-[#c9a227] bg-[#c9a227]/5'
              : 'border-gray-700 hover:border-gray-500'
          }`}
        >
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <p className="text-gray-400 text-sm">
            Drop an audio file here or click to browse
          </p>
          <p className="text-gray-600 text-xs mt-1">
            WAV and FLAC recommended for ultrasonic analysis. MP3/AAC may strip high frequencies.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_AUDIO}
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}

      {/* Loaded Audio Info + Analyze Button */}
      {audioBuffer && inputMode !== 'live' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-gray-900 border border-gray-700 rounded-lg p-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-200">{fileName}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {audioBuffer.duration.toFixed(2)}s &middot; {audioBuffer.sampleRate} Hz &middot; {audioBuffer.numberOfChannels} channel(s) &middot;
              Max freq: {(audioBuffer.sampleRate / 2000).toFixed(1)} kHz
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">FFT:</label>
            <select
              value={fftSize}
              onChange={(e) => setFftSize(Number(e.target.value))}
              className="bg-gray-800 text-gray-300 text-xs border border-gray-600 rounded px-2 py-1"
            >
              <option value={2048}>2048</option>
              <option value={4096}>4096</option>
              <option value={8192}>8192</option>
            </select>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="px-5 py-2 bg-gradient-to-r from-[#8b0000] to-[#5c0000] text-[#c9a227] font-semibold rounded-lg shadow-lg hover:from-[#a00000] hover:to-[#700000] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
          >
            {isAnalyzing ? progress || 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      )}

      {/* Playback (available immediately after load/generate, before analysis) */}
      {audioBuffer && inputMode !== 'live' && !result && (
        <AudioPlayer buffer={audioBuffer} label="Original Audio" />
      )}

      {/* Results */}
      {result && inputMode !== 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Spectrogram + Players — Left 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            {/* Spectrogram */}
            <div className="bg-gray-950 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Frequency Spectrum</h3>
                <div className="text-xs text-gray-500">
                  {result.spectrogramData.length} frames &middot; {result.frequencyResolution.toFixed(1)} Hz/bin &middot;
                  0–{(result.maxAnalyzableFreq / 1000).toFixed(1)} kHz
                </div>
              </div>
              {result.spectrogramData.length > 0 ? (
                <SpectrogramCanvas
                  data={result.spectrogramData}
                  sampleRate={result.sampleRate}
                  fftSize={result.fftSize}
                  peakFreqHz={peakFreqHz}
                />
              ) : (
                <div className="text-gray-500 text-sm text-center py-8">No spectrogram data</div>
              )}
            </div>

            {/* Audio Players */}
            {audioBuffer && (
              <AudioPlayer buffer={audioBuffer} label="Original Audio" />
            )}
            {result.demodulatedBuffer && (
              <AudioPlayer buffer={result.demodulatedBuffer} label="Demodulated Envelope (AM extraction)" />
            )}
          </div>

          {/* Findings Panel — Right 1/3 */}
          <div className="space-y-4">
            {/* Overall Risk Badge */}
            <div className={`rounded-lg p-4 border ${riskColors[result.overallRisk]?.bg ?? 'bg-gray-900'} border-gray-700`}>
              <div className="text-center">
                <div className={`text-2xl font-bold ${riskColors[result.overallRisk]?.text ?? 'text-gray-400'}`}>
                  {riskColors[result.overallRisk]?.label ?? 'Unknown'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {result.findings.length} finding{result.findings.length !== 1 ? 's' : ''} &middot;
                  {result.overallConfidence}% peak confidence
                </div>
              </div>
            </div>

            {/* Audio Info */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Sample Rate</span>
                <span className="text-gray-300 font-mono">{result.sampleRate} Hz</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Frequency</span>
                <span className="text-gray-300 font-mono">{(result.maxAnalyzableFreq / 1000).toFixed(1)} kHz</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="text-gray-300 font-mono">{result.duration.toFixed(2)}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">FFT Size</span>
                <span className="text-gray-300 font-mono">{result.fftSize}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Freq Resolution</span>
                <span className="text-gray-300 font-mono">{result.frequencyResolution.toFixed(1)} Hz</span>
              </div>
            </div>

            {/* Finding Cards */}
            {result.findings.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-300">Detection Findings</h3>
                  <button
                    onClick={() => {
                      const report = {
                        timestamp: new Date().toISOString(),
                        file: fileName,
                        sampleRate: result.sampleRate,
                        duration: result.duration,
                        overallRisk: result.overallRisk,
                        overallConfidence: result.overallConfidence,
                        findings: result.findings,
                      };
                      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `ultrasonic-report-${fileName.replace(/\.[^.]+$/, '')}.json`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 100);
                    }}
                    className="text-xs text-gray-500 hover:text-[#c9a227] transition-colors"
                    title="Export findings as JSON"
                  >
                    Export
                  </button>
                </div>
                {result.findings.map((finding, i) => (
                  <FindingCard key={`${finding.ruleId}-${i}`} finding={finding} />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 text-sm">
                No findings — audio appears clean.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcription + Prompt Scan */}
      {audioBuffer && inputMode !== 'live' && (
        <TranscriptionPanel
          audioBuffer={audioBuffer}
          demodulatedBuffer={result?.demodulatedBuffer ?? null}
        />
      )}

      {/* Education */}
      <EducationSection />
    </div>
  );
}
