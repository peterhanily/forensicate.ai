import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AddRuleModal,
  AddSectionModal,
  RuleLogicModal,
  AddPromptModal,
  AddPromptSectionModal,
  ExportImportModal,
} from '../src/components/RuleModal';
import type { DetectionRule, RuleCategory } from '../src/lib/scanner/types';

describe('AddRuleModal', () => {
  const mockCategories: RuleCategory[] = [
    {
      id: 'test-category',
      name: 'Test Category',
      description: 'A test category',
      rules: [],
    },
  ];

  const mockOnClose = vi.fn();
  const mockOnAddRule = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      <AddRuleModal
        isOpen={true}
        onClose={mockOnClose}
        onAddRule={mockOnAddRule}
        categories={mockCategories}
      />
    );

    expect(screen.getByText('Add Detection Rule')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <AddRuleModal
        isOpen={false}
        onClose={mockOnClose}
        onAddRule={mockOnAddRule}
        categories={mockCategories}
      />
    );

    expect(screen.queryByText('Add Detection Rule')).not.toBeInTheDocument();
  });

  it('closes when backdrop is clicked', () => {
    render(
      <AddRuleModal
        isOpen={true}
        onClose={mockOnClose}
        onAddRule={mockOnAddRule}
        categories={mockCategories}
      />
    );

    const backdrop = document.querySelector('.bg-black\\/70');
    if (backdrop) fireEvent.click(backdrop);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows error when submitting without name', async () => {
    const user = userEvent.setup();
    render(
      <AddRuleModal
        isOpen={true}
        onClose={mockOnClose}
        onAddRule={mockOnAddRule}
        categories={mockCategories}
      />
    );

    const addButton = screen.getByRole('button', { name: /add rule/i });
    await user.click(addButton);

    expect(screen.getByText('Rule name is required')).toBeInTheDocument();
  });

  it('switches between keyword and regex types', async () => {
    const user = userEvent.setup();
    render(
      <AddRuleModal
        isOpen={true}
        onClose={mockOnClose}
        onAddRule={mockOnAddRule}
        categories={mockCategories}
      />
    );

    const regexButton = screen.getByRole('button', { name: /regex/i });
    await user.click(regexButton);

    // Look for the Regex Pattern label and associated textarea
    expect(screen.getByText('Regex Pattern')).toBeInTheDocument();
  });
});

describe('AddSectionModal', () => {
  const mockOnClose = vi.fn();
  const mockOnAddSection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      <AddSectionModal
        isOpen={true}
        onClose={mockOnClose}
        onAddSection={mockOnAddSection}
      />
    );

    expect(screen.getByText('Add Rule Section')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <AddSectionModal
        isOpen={false}
        onClose={mockOnClose}
        onAddSection={mockOnAddSection}
      />
    );

    expect(screen.queryByText('Add Rule Section')).not.toBeInTheDocument();
  });

  it('shows error when submitting without name', async () => {
    const user = userEvent.setup();
    render(
      <AddSectionModal
        isOpen={true}
        onClose={mockOnClose}
        onAddSection={mockOnAddSection}
      />
    );

    const addButton = screen.getByRole('button', { name: /add section/i });
    await user.click(addButton);

    expect(screen.getByText('Section name is required')).toBeInTheDocument();
  });
});

describe('RuleLogicModal', () => {
  const mockOnClose = vi.fn();

  const mockKeywordRule: DetectionRule = {
    id: 'test-kw',
    name: 'Test Keyword Rule',
    description: 'A test rule',
    type: 'keyword',
    severity: 'high',
    enabled: true,
    keywords: ['test1', 'test2'],
  };

  const mockRegexRule: DetectionRule = {
    id: 'test-rx',
    name: 'Test Regex Rule',
    description: 'A test regex rule',
    type: 'regex',
    severity: 'critical',
    enabled: true,
    pattern: 'test\\s+pattern',
    flags: 'gi',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders keyword rule logic', () => {
    render(
      <RuleLogicModal isOpen={true} onClose={mockOnClose} rule={mockKeywordRule} />
    );

    // Use getAllByText for elements that appear multiple times
    expect(screen.getAllByText('Detection Logic').length).toBeGreaterThan(0);
    expect(screen.getByText('Test Keyword Rule')).toBeInTheDocument();
    expect(screen.getByText('Keyword Detection')).toBeInTheDocument();
    expect(screen.getByText(/test1/)).toBeInTheDocument();
  });

  it('renders regex rule logic', () => {
    render(
      <RuleLogicModal isOpen={true} onClose={mockOnClose} rule={mockRegexRule} />
    );

    expect(screen.getByText('Test Regex Rule')).toBeInTheDocument();
    expect(screen.getByText('Regular Expression')).toBeInTheDocument();
    expect(screen.getByText(/test\\s\+pattern/)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <RuleLogicModal isOpen={false} onClose={mockOnClose} rule={mockKeywordRule} />
    );

    expect(screen.queryByText('Detection Logic')).not.toBeInTheDocument();
  });

  it('does not render when rule is null', () => {
    render(
      <RuleLogicModal isOpen={true} onClose={mockOnClose} rule={null} />
    );

    expect(screen.queryByText('Detection Logic')).not.toBeInTheDocument();
  });
});

describe('AddPromptModal', () => {
  const mockCategories = [
    { id: 'cat1', name: 'Category 1' },
    { id: 'cat2', name: 'Category 2' },
  ];

  const mockOnClose = vi.fn();
  const mockOnAddPrompt = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      <AddPromptModal
        isOpen={true}
        onClose={mockOnClose}
        onAddPrompt={mockOnAddPrompt}
        categories={mockCategories}
      />
    );

    expect(screen.getByText('Add Test Prompt')).toBeInTheDocument();
  });

  it('shows error when submitting without name', async () => {
    const user = userEvent.setup();
    render(
      <AddPromptModal
        isOpen={true}
        onClose={mockOnClose}
        onAddPrompt={mockOnAddPrompt}
        categories={mockCategories}
      />
    );

    const addButton = screen.getByRole('button', { name: /add prompt/i });
    await user.click(addButton);

    expect(screen.getByText('Prompt name is required')).toBeInTheDocument();
  });
});

describe('AddPromptSectionModal', () => {
  const mockOnClose = vi.fn();
  const mockOnAddSection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      <AddPromptSectionModal
        isOpen={true}
        onClose={mockOnClose}
        onAddSection={mockOnAddSection}
      />
    );

    expect(screen.getByText('Add Prompt Section')).toBeInTheDocument();
  });
});

describe('ExportImportModal', () => {
  const mockOnClose = vi.fn();
  const mockOnExport = vi.fn(() => JSON.stringify({ version: '1.0' }));
  const mockOnImport = vi.fn(() => ({ success: true, summary: 'Imported' }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      <ExportImportModal
        isOpen={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        onImport={mockOnImport}
      />
    );

    expect(screen.getByText('Export / Import Configuration')).toBeInTheDocument();
  });

  it('shows export mode by default', () => {
    render(
      <ExportImportModal
        isOpen={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        onImport={mockOnImport}
      />
    );

    expect(screen.getByText('Download Configuration')).toBeInTheDocument();
  });

  it('switches to import mode', async () => {
    const user = userEvent.setup();
    render(
      <ExportImportModal
        isOpen={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        onImport={mockOnImport}
      />
    );

    const importButton = screen.getByRole('button', { name: /^import$/i });
    await user.click(importButton);

    expect(screen.getByText('Import Configuration')).toBeInTheDocument();
  });
});
