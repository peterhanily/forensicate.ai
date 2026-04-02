import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);

    // The app should render the layout with the app name
    expect(screen.getByText('Forensicate.ai')).toBeInTheDocument();
  });

  it('renders landing page at root path', async () => {
    render(<App />);

    // The landing page should show the hero heading
    await waitFor(() => {
      expect(
        screen.getByText(/AI Prompt Security/i)
      ).toBeInTheDocument();
    });
  });

  it('renders the navigation', () => {
    render(<App />);

    // Find the first "Prompt Scanner" link (desktop nav)
    const links = screen.getAllByRole('link', { name: /prompt scanner/i });
    expect(links.length).toBeGreaterThan(0);
  });
});
