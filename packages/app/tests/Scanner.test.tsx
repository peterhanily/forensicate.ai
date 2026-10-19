import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_SCAN_LENGTH } from '@forensicate/scanner';
import Scanner from '../src/pages/Scanner';
import { STORAGE_KEY } from '../src/lib/storage/storage';

vi.mock('@forensicate/scanner', async importOriginal => ({
  ...await importOriginal<typeof import('@forensicate/scanner')>(),
  fetchAllCommunityRules: vi.fn().mockResolvedValue([]),
  fetchAllCommunityPrompts: vi.fn().mockResolvedValue([]),
}));

function renderBenignBatchFixture() {
  const previous = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: '1.0', savedAt: new Date().toISOString(),
    rules: { localRules: [], customCategories: [] },
    prompts: {
      localPrompts: [],
      customPromptCategories: [{
        id: 'custom-prompt-section-batch', name: 'Meeting notes', description: 'Benign fixture', source: 'test',
        prompts: [{ id: 'custom-meeting', name: 'Meeting note', content: 'The meeting starts at noon.', tags: [] }],
      }],
    },
    ui: { autoImportCommunityRules: false, autoImportCommunityPrompts: false, tourCompleted: true },
  }));
  const { unmount } = render(<Scanner />);
  return () => {
    unmount();
    if (previous === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, previous);
  };
}

describe('Scanner', () => {
  it.each(['automatic', 'manual'])('keeps a queued batch running through a text edit in %s mode', async mode => {
    vi.useFakeTimers();
    const cleanupFixture = renderBenignBatchFixture();
    try {
      if (mode === 'manual') fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Select All', exact: true }));
      const batchButton = screen.getByRole('button', { name: 'Batch Scan (1)', exact: true });
      fireEvent.click(batchButton);
      fireEvent.change(screen.getByRole('textbox', { name: 'Prompt text to analyze' }), {
        target: { value: 'Updated meeting notes.' },
      });
      expect(batchButton).toBeDisabled();

      await act(async () => { await vi.advanceTimersByTimeAsync(150); });
      expect(screen.getByRole('heading', { name: 'Batch Scan Results' })).toBeInTheDocument();
      expect(screen.getByText('1 prompts scanned')).toBeInTheDocument();
      expect(batchButton).toBeEnabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      cleanupFixture();
      vi.useRealTimers();
    }
  });

  it('explains settings cancellation and allows the batch to be run again', async () => {
    vi.useFakeTimers();
    const cleanupFixture = renderBenignBatchFixture();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Select All', exact: true }));
      const batchButton = screen.getByRole('button', { name: 'Batch Scan (1)', exact: true });
      fireEvent.click(batchButton);
      fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
      expect(screen.getByRole('alert')).toHaveTextContent('Batch was cancelled because scan settings changed');
      expect(batchButton).toBeEnabled();
      await act(async () => { await vi.advanceTimersByTimeAsync(150); });
      expect(screen.queryByRole('heading', { name: 'Batch Scan Results' })).not.toBeInTheDocument();

      fireEvent.click(batchButton);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(150); });
      expect(screen.getByRole('heading', { name: 'Batch Scan Results' })).toBeInTheDocument();
    } finally {
      cleanupFixture();
      vi.useRealTimers();
    }
  });

  it('shows a failed oversized batch even while file scan mode is selected', async () => {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: '1.0', savedAt: new Date().toISOString(),
      rules: { localRules: [], customCategories: [] },
      prompts: {
        localPrompts: [],
        customPromptCategories: [{
          id: 'custom-prompt-section-limits', name: 'Input limits', description: 'Benign fixture', source: 'test',
          prompts: [{ id: 'custom-large', name: 'Large note', content: 'a'.repeat(MAX_SCAN_LENGTH + 1), tags: [] }],
        }],
      },
      ui: { autoImportCommunityRules: false, autoImportCommunityPrompts: false, tourCompleted: true },
    }));
    const { unmount } = render(<Scanner />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'file_scan', exact: true }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All', exact: true }));
      fireEvent.click(screen.getByRole('button', { name: 'Batch Scan (1)', exact: true }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Batch was not completed'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      unmount();
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    }
  });

  it('rescans the same prompt after an oversized edit clears its result', async () => {
    await act(async () => { render(<Scanner />); });
    const textarea = screen.getByRole('textbox', { name: 'Prompt text to analyze' });
    fireEvent.change(textarea, { target: { value: 'Meeting at noon.' } });
    await waitFor(() => expect(screen.getAllByText(/Scanned at/).length).toBeGreaterThan(0));
    fireEvent.change(textarea, { target: { value: 'a'.repeat(MAX_SCAN_LENGTH + 1) } });
    expect(screen.getByRole('alert')).toHaveTextContent('Text was not scanned');
    expect(screen.queryAllByText(/Scanned at/)).toHaveLength(0);
    fireEvent.change(textarea, { target: { value: 'Meeting at noon.' } });
    await waitFor(() => expect(screen.getAllByText(/Scanned at/).length).toBeGreaterThan(0));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an oversized input as not scanned and recovers after shortening it', async () => {
    await act(async () => { render(<Scanner />); });
    const textarea = screen.getByRole('textbox', { name: 'Prompt text to analyze' });
    fireEvent.change(textarea, { target: { value: 'a'.repeat(MAX_SCAN_LENGTH + 1) } });
    expect(screen.getByRole('alert')).toHaveTextContent('Text was not scanned');
    expect(screen.getByRole('alert')).toHaveTextContent('1,000,000');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Scan', exact: true })).toBeDisabled();
    fireEvent.change(textarea, { target: { value: 'Meeting at noon.' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Scan', exact: true }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')?.textContent ?? '').toBe('');
      expect(screen.getAllByText(/Scanned at/).length).toBeGreaterThan(0);
    });
  });

  it('cancels a queued manual scan when the input changes', async () => {
    await act(async () => { render(<Scanner />); });
    fireEvent.click(screen.getByRole('checkbox'));
    const textarea = screen.getByRole('textbox', { name: 'Prompt text to analyze' });
    fireEvent.change(textarea, { target: { value: 'Meeting at noon.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Scan', exact: true }));
    fireEvent.change(textarea, { target: { value: 'a'.repeat(MAX_SCAN_LENGTH + 1) } });
    expect(screen.getByRole('alert')).toHaveTextContent('Text was not scanned');
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(screen.queryByText(/Scanned at/)).not.toBeInTheDocument();
    expect(screen.queryByText('Scanning...')).not.toBeInTheDocument();
  });

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
    // Filter out collapsible section headers (scan_results) and mode toggle buttons (text_input, file_scan)
    const actionButtons = scanButtons.filter(btn =>
      !btn.textContent?.includes('scan_results') &&
      !btn.textContent?.includes('file_scan') &&
      !btn.textContent?.includes('text_input')
    );
    expect(actionButtons.every(btn => btn.textContent?.includes('Batch'))).toBe(true);
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

  it('replaces rules from a re-imported YAML file and keeps saved settings across reloads', async () => {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: '1.0', savedAt: new Date().toISOString(),
      rules: { localRules: [], customCategories: [] },
      prompts: {
        localPrompts: [],
        customPromptCategories: [{ id: 'custom-prompt-section-yaml', name: 'Saved review prompts', description: 'Benign fixture', source: 'test', prompts: [] }],
      },
      ui: { autoImportCommunityRules: false, autoImportCommunityPrompts: false, tourCompleted: true },
    }));
    const yaml = new File(['name: Zebra Rule\ntype: keyword\nseverity: high\nkeywords:\n  - "zebra canary"\n'], 'zebra.yaml');
    const settle = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
    try {
      const first = render(<Scanner />);
      for (let attempt = 0; attempt < 2; attempt++) {
        fireEvent.change(screen.getByLabelText('Import YAML rule file'), { target: { files: [yaml] } });
        await settle(100);
      }
      expect(screen.getByText(/replacing 1 existing rule with the same ID/)).toBeInTheDocument();
      await settle(600);
      first.unmount();
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.rules.localRules.map((rule: { id: string }) => rule.id)).toEqual(['yaml-plugin']);

      const second = render(<Scanner />);
      expect(screen.getAllByText('Saved review prompts').length).toBeGreaterThan(0);
      second.unmount();
    } finally {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    }
  });

  it('uses the ?text= hand-off once and removes it from the address bar', () => {
    window.history.replaceState(null, '', '/scanner?text=Hand-off%20fixture&view=review');
    try {
      const view = render(<Scanner />);
      expect((screen.getByRole('textbox', { name: 'Prompt text to analyze' }) as HTMLTextAreaElement).value).toBe('Hand-off fixture');
      expect(window.location.search).toBe('?view=review');
      view.unmount();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('keeps rules from two different YAML files that have no ids', async () => {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    const files = [
      new File(['name: Zebra Rule\ntype: keyword\nseverity: high\nkeywords:\n  - "zebra canary"\n'], 'zebra.yaml'),
      new File(['name: Yak Rule\ntype: keyword\nseverity: high\nkeywords:\n  - "yak canary"\n'], 'yak.yaml'),
    ];
    const settle = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
    try {
      const view = render(<Scanner />);
      for (const file of files) {
        fireEvent.change(screen.getByLabelText('Import YAML rule file'), { target: { files: [file] } });
        await settle(100);
      }
      expect(screen.queryByText(/replacing/)).not.toBeInTheDocument();
      await settle(600);
      view.unmount();
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.rules.localRules.map((rule: { id: string; name: string }) => `${rule.id}:${rule.name}`))
        .toEqual(['yaml-plugin:Zebra Rule', 'yaml-plugin-2:Yak Rule']);
    } finally {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    }
  });
});
