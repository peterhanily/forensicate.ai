import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MAX_SCAN_LENGTH } from '@forensicate/scanner';
import BlogDetection from '../src/pages/BlogDetection';
import LearnModelAttacks from '../src/pages/LearnModelAttacks';
import LearnJailbreaks from '../src/pages/LearnJailbreaks';
import ForensicTimeline from '../src/pages/ForensicTimeline';
import Compliance from '../src/pages/Compliance';
import { TranscriptionPanel } from '../src/pages/UltrasonicAnalyzer';
import { transcribeAudioBuffer } from '../src/lib/ultrasonicAnalyzer';

vi.mock('../src/lib/ultrasonicAnalyzer', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/ultrasonicAnalyzer')>(),
  isSpeechRecognitionAvailable: () => true,
  transcribeAudioBuffer: vi.fn().mockResolvedValue({ stop: () => {} }),
}));

const benignText = 'The meeting starts at noon.';
const oversizedText = 'a'.repeat(MAX_SCAN_LENGTH + 1);

beforeEach(() => {
  vi.mocked(transcribeAudioBuffer).mockReset().mockResolvedValue({ stop: () => {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Secondary scanner input handling', () => {
  it('clears a compliance rejection when selecting a benign sample and generates a new report', () => {
    render(<MemoryRouter><Compliance /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: oversizedText } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Compliance Report' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Text was not scanned');
    expect(screen.queryByText('Compliance Score')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Benign', exact: true }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Compliance Report' }));
    expect(screen.getByText('Compliance Score')).toBeInTheDocument();
  });

  it.each([
    ['detection guide', BlogDetection],
    ['model education', LearnModelAttacks],
    ['jailbreak education', LearnJailbreaks],
  ])('%s shows scan rejection and recovers without a stale successful result', (_label, Page) => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    const input = screen.getAllByRole('textbox')[0];
    const scan = screen.getAllByRole('button', { name: 'Scan', exact: true })[0];

    fireEvent.change(input, { target: { value: benignText } });
    fireEvent.click(scan);
    expect(screen.getByText('Clean — no injection detected')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: oversizedText } });
    expect(screen.queryByText('Clean — no injection detected')).not.toBeInTheDocument();
    fireEvent.click(scan);
    expect(screen.getByRole('alert')).toHaveTextContent('Text was not scanned');
    expect(screen.getByRole('alert')).toHaveTextContent('1,000,000');

    fireEvent.change(input, { target: { value: benignText } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(scan);
    expect(screen.getByText('Clean — no injection detected')).toBeInTheDocument();
  });

  it('rejects an oversized manual transcript before trimming and clears previous success', () => {
    render(<TranscriptionPanel audioBuffer={{} as AudioBuffer} demodulatedBuffer={null} />);
    const input = screen.getByRole('textbox');
    const scan = screen.getByRole('button', { name: 'Scan', exact: true });
    fireEvent.change(input, { target: { value: benignText } });
    fireEvent.click(scan);
    expect(screen.getByText('No Prompt Injection Detected')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: ' '.repeat(MAX_SCAN_LENGTH) + benignText } });
    expect(screen.queryByText('No Prompt Injection Detected')).not.toBeInTheDocument();
    fireEvent.click(scan);
    expect(screen.getByRole('alert')).toHaveTextContent('Text was not scanned');

    fireEvent.change(input, { target: { value: benignText } });
    fireEvent.click(scan);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('No Prompt Injection Detected')).toBeInTheDocument();
  });

  it('shows automatic transcript rejection instead of retaining a previous scan score', async () => {
    render(<TranscriptionPanel audioBuffer={{} as AudioBuffer} demodulatedBuffer={null} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: benignText } });
    fireEvent.click(screen.getByRole('button', { name: 'Scan', exact: true }));
    expect(screen.getByText('No Prompt Injection Detected')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Transcribe & Scan' }));
    });
    const onFinal = vi.mocked(transcribeAudioBuffer).mock.calls[0][2];
    act(() => { onFinal({ transcript: oversizedText, confidence: 1, isFinal: true }); });
    expect(screen.getByRole('alert')).toHaveTextContent('Text was not scanned');
    expect(screen.queryByText('No Prompt Injection Detected')).not.toBeInTheDocument();

    act(() => { onFinal({ transcript: benignText, confidence: 1, isFinal: true }); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('No Prompt Injection Detected')).toBeInTheDocument();
  });

  it('shows transcription startup errors and resets the listening state', async () => {
    vi.mocked(transcribeAudioBuffer).mockRejectedValue(new Error('Microphone unavailable'));
    render(<TranscriptionPanel audioBuffer={{} as AudioBuffer} demodulatedBuffer={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Transcribe & Scan' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Text was not scanned. Microphone unavailable');
    expect(screen.queryByText(/Listening/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transcribe & Scan' })).toBeEnabled();
  });

  it('explains timeline scan failures and removes stale analysis when input changes', async () => {
    vi.useFakeTimers();
    render(<ForensicTimeline />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: benignText } });
    await act(async () => { await vi.advanceTimersByTimeAsync(401); });
    expect(screen.getByText('No injection patterns detected')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: oversizedText } });
    expect(screen.queryByText('No injection patterns detected')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(401); });
    expect(screen.getByRole('alert')).toHaveTextContent('Text was not scanned');

    fireEvent.change(input, { target: { value: benignText } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(401); });
    expect(screen.getByText('No injection patterns detected')).toBeInTheDocument();
  });
});
