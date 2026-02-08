import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../src/components/Layout';
import { APP_NAME, APP_VERSION } from '../src/lib/constants';

const renderWithRouter = (ui: React.ReactElement, { route = '/' } = {}) => {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
};

describe('Layout', () => {
  it('renders the app name in the header', () => {
    renderWithRouter(<Layout />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(APP_NAME);
  });

  it('renders the footer with version', () => {
    renderWithRouter(<Layout />);

    expect(screen.getByText(`${APP_NAME} v${APP_VERSION}`)).toBeInTheDocument();
  });

  it('renders the navigation items', () => {
    renderWithRouter(<Layout />);

    expect(screen.getByRole('link', { name: /prompt scanner/i })).toBeInTheDocument();
    expect(screen.getByText(/ai jeopardy/i)).toBeInTheDocument();
    expect(screen.getByText(/ai log constructor/i)).toBeInTheDocument();
  });

  it('has disabled navigation items rendered as spans', () => {
    renderWithRouter(<Layout />);

    // Enabled item is a link
    const scannerLink = screen.getByRole('link', { name: /prompt scanner/i });
    expect(scannerLink).toHaveAttribute('href', '/scanner');

    // Disabled items are not links (they're spans)
    expect(screen.queryByRole('link', { name: /ai jeopardy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ai log constructor/i })).not.toBeInTheDocument();
  });

  it('applies correct styling to disabled nav items', () => {
    renderWithRouter(<Layout />);

    const disabledItem = screen.getByText(/ai jeopardy/i);
    expect(disabledItem).toHaveClass('cursor-not-allowed');
    expect(disabledItem).toHaveClass('text-gray-600');
  });

  it('logo links to home page', () => {
    renderWithRouter(<Layout />);

    // Find the link containing the logo (by finding the "F" text inside)
    const logoLink = screen.getByRole('link', { name: /f/i });
    expect(logoLink).toHaveAttribute('href', '/');
  });

  it('renders download button', () => {
    renderWithRouter(<Layout />);

    // Desktop button says "Download", mobile says "Download Offline Version"
    const downloadButton = screen.getByRole('button', { name: /download/i });
    expect(downloadButton).toBeInTheDocument();
    expect(downloadButton).toHaveAttribute('title', 'Download as standalone HTML file - works offline!');
  });
});
