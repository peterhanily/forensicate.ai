import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);

    // The app should render the layout with the app name
    expect(screen.getByText('Forensicate.ai')).toBeInTheDocument();
  });

  it('redirects root path to scanner page', async () => {
    render(<App />);

    // After redirect, the Scanner page content should be visible
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /prompt scanner/i })
      ).toBeInTheDocument();
    });
  });

  it('renders the navigation', () => {
    render(<App />);

    expect(
      screen.getByRole('link', { name: /prompt scanner/i })
    ).toBeInTheDocument();
  });
});
