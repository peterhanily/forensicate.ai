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

    // Desktop nav uses shortened labels; mobile nav also present
    const scannerLinks = screen.getAllByRole('link', { name: /scanner/i });
    expect(scannerLinks.length).toBeGreaterThan(0);
  });

  it('logo links to home page', () => {
    renderWithRouter(<Layout />);

    // Find the link containing the logo (by matching the app name)
    const logoLink = screen.getByRole('link', { name: new RegExp(APP_NAME, 'i') });
    expect(logoLink).toHaveAttribute('href', '/');
  });

  it('renders the More dropdown button', () => {
    renderWithRouter(<Layout />);

    // Desktop nav has a "More" dropdown
    const moreButton = screen.getByRole('button', { name: /more/i });
    expect(moreButton).toBeInTheDocument();
  });
});
