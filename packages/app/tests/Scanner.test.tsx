import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Scanner from '../src/pages/Scanner';

describe('Scanner', () => {
  it('renders the scanner page title', () => {
    render(<Scanner />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Prompt Scanner'
    );
  });

  it('renders the description text', () => {
    render(<Scanner />);

    expect(
      screen.getByText(/detect prompt injection attacks/i)
    ).toBeInTheDocument();
  });

  it('renders the prompt input textarea', () => {
    render(<Scanner />);

    expect(screen.getByPlaceholderText(/enter or paste a prompt/i)).toBeInTheDocument();
  });

  it('renders the auto-scan toggle enabled by default', () => {
    render(<Scanner />);

    // Auto-scan is on by default, so we see "Auto-scan enabled" text
    expect(screen.getByText('Auto-scan enabled')).toBeInTheDocument();
    // The manual Scan button should NOT be visible when auto-scan is on
    const scanButtons = screen.getAllByRole('button', { name: /scan/i });
    // Only the Batch Scan button should exist
    expect(scanButtons.every(btn => btn.textContent?.includes('Batch'))).toBe(true);
  });

  it('renders the test battery panel', () => {
    render(<Scanner />);

    expect(screen.getByText('Test Battery')).toBeInTheDocument();
    expect(screen.getByText(/select prompts to analyze/i)).toBeInTheDocument();
  });

  it('shows manual scan button when auto-scan is toggled off', async () => {
    const user = userEvent.setup();
    render(<Scanner />);

    // Toggle auto-scan off by clicking the Auto checkbox
    const autoCheckbox = screen.getByRole('checkbox');
    await user.click(autoCheckbox);

    // Now the manual Scan button should appear
    expect(screen.getByText('Manual scan mode')).toBeInTheDocument();
    const scanButtons = screen.getAllByRole('button', { name: /scan/i });
    const manualScanButton = scanButtons.find(btn => btn.textContent === 'Scan');
    expect(manualScanButton).toBeDefined();
  });

  it('manual scan button is disabled when textarea is empty', async () => {
    const user = userEvent.setup();
    render(<Scanner />);

    // Toggle auto-scan off to reveal the manual scan button
    const autoCheckbox = screen.getByRole('checkbox');
    await user.click(autoCheckbox);

    const scanButtons = screen.getAllByRole('button', { name: /scan/i });
    const manualScanButton = scanButtons.find(btn => btn.textContent === 'Scan');
    expect(manualScanButton).toBeDisabled();
  });

  it('manual scan button is enabled when textarea has content', async () => {
    const user = userEvent.setup();
    render(<Scanner />);

    // Toggle auto-scan off
    const autoCheckbox = screen.getByRole('checkbox');
    await user.click(autoCheckbox);

    const textarea = screen.getByPlaceholderText(/enter or paste a prompt/i);
    await user.type(textarea, 'Test prompt');

    const scanButtons = screen.getAllByRole('button', { name: /scan/i });
    const manualScanButton = scanButtons.find(btn => btn.textContent === 'Scan');
    expect(manualScanButton).not.toBeDisabled();
  });

  it('displays character count', async () => {
    const user = userEvent.setup();
    render(<Scanner />);

    const textarea = screen.getByPlaceholderText(/enter or paste a prompt/i);
    await user.type(textarea, 'Hello');

    expect(screen.getByText('5 chars')).toBeInTheDocument();
  });

  it('clears the textarea when clear button is clicked', async () => {
    const user = userEvent.setup();
    render(<Scanner />);

    const textarea = screen.getByPlaceholderText(/enter or paste a prompt/i) as HTMLTextAreaElement;
    await user.type(textarea, 'Test prompt');
    expect(textarea.value).toBe('Test prompt');

    // Get the clear button specifically for the textarea (the one with lowercase "clear")
    const clearButtons = screen.getAllByRole('button', { name: /clear/i });
    // The textarea clear button is the first one (in prompt_input header)
    const clearButton = clearButtons[0];
    await user.click(clearButton);

    expect(textarea.value).toBe('');
  });

  it('renders a single Export/Import button at the top', () => {
    render(<Scanner />);

    // There should be exactly one Export/Import button
    const exportImportButtons = screen.getAllByRole('button', { name: /export.*import/i });
    expect(exportImportButtons).toHaveLength(1);
  });

  it('renders the confidence threshold slider', () => {
    render(<Scanner />);

    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '99');
  });

  it('renders the threshold label text', () => {
    render(<Scanner />);

    expect(screen.getByText('Threshold:')).toBeInTheDocument();
  });
});
