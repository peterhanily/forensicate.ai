import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Scanner from '../src/pages/Scanner';

describe('File Scanner Integration', () => {
  it('renders the mode toggle with text_input and file_scan buttons', () => {
    render(<Scanner />);

    expect(screen.getByText('text_input')).toBeInTheDocument();
    expect(screen.getByText('file_scan')).toBeInTheDocument();
  });

  it('starts in text_input mode with textarea visible', () => {
    render(<Scanner />);

    expect(screen.getByPlaceholderText(/enter or paste a prompt/i)).toBeInTheDocument();
    // file_input header should NOT be visible in text mode
    expect(screen.queryByText('file_input')).not.toBeInTheDocument();
  });

  it('switches to file_scan mode showing file drop zone', async () => {
    render(<Scanner />);

    const fileScanButton = screen.getByText('file_scan');
    fireEvent.click(fileScanButton);

    // File input header should now be visible (lazy-loaded)
    await waitFor(() => {
      expect(screen.getByText('file_input')).toBeInTheDocument();
    });
    expect(screen.getByText(/drop a file here or click to browse/i)).toBeInTheDocument();
    // Text input should not be visible
    expect(screen.queryByPlaceholderText(/enter or paste a prompt/i)).not.toBeInTheDocument();
  });

  it('switches back to text_input mode', async () => {
    render(<Scanner />);

    // Switch to file mode
    fireEvent.click(screen.getByText('file_scan'));
    await waitFor(() => {
      expect(screen.getByText('file_input')).toBeInTheDocument();
    });

    // Switch back to text mode
    fireEvent.click(screen.getByText('text_input'));
    expect(screen.getByPlaceholderText(/enter or paste a prompt/i)).toBeInTheDocument();
    expect(screen.queryByText('file_input')).not.toBeInTheDocument();
  });

  it('shows file test categories in sidebar test battery', () => {
    render(<Scanner />);

    // File test categories are always visible in the sidebar test battery
    expect(screen.getByText('File Tests')).toBeInTheDocument();
  });

  it('mode toggle highlights the active mode', () => {
    render(<Scanner />);

    const textButton = screen.getByText('text_input');
    const fileButton = screen.getByText('file_scan');

    // Text mode is active by default
    expect(textButton.className).toContain('c9a227');
    expect(fileButton.className).not.toContain('c9a227/20');

    // Switch to file mode
    fireEvent.click(fileButton);
    expect(fileButton.className).toContain('c9a227');
  });
});
