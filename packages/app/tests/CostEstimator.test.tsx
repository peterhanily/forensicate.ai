import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CostEstimator from '../src/components/CostEstimator';

describe('CostEstimator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  function expand() {
    fireEvent.click(screen.getByRole('button', { name: /COST ESTIMATE/ }));
  }

  it('shows per-million rates under the rate headers, distinct from the request total', () => {
    render(<CostEstimator promptText="text" providers={[{ provider: 'openai', model: 'gpt-5.2-pro' }]} />);
    expand();
    expect(screen.getByText('IN/1M')).toBeInTheDocument();
    expect(screen.getByText('$21.00')).toBeInTheDocument();
    expect(screen.getByText('$168.00')).toBeInTheDocument();
    expect(screen.getAllByText('$0.017').length).toBeGreaterThan(0);
    expect(screen.getByText('Verified Oct 16, 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'developers.openai.com' })).toHaveAttribute(
      'href', 'https://developers.openai.com/api/docs/models/gpt-5.2-pro',
    );
  });

  it('marks historical prices unverified instead of using a new blanket verification date', () => {
    render(<CostEstimator promptText="text" providers={[{ provider: 'perplexity', model: 'sonar' }]} />);
    expand();
    expect(screen.getByText('UNVERIFIED RATE')).toBeInTheDocument();
    expect(screen.getByText('Recorded Mar 15, 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Verified Oct/)).not.toBeInTheDocument();
  });

  it('makes stale verification visible', () => {
    vi.setSystemTime(new Date('2026-11-16T00:00:00Z'));
    render(<CostEstimator promptText="text" providers={[{ provider: 'openai', model: 'gpt-5.2' }]} />);
    expand();
    expect(screen.getByText('DATA STALE (>30d)')).toBeInTheDocument();
  });

  it('uses neutral comparison labels and discloses exclusions for batch estimates', () => {
    render(<CostEstimator promptText="text" mode="batch" batchSize={2} />);
    expand();
    fireEvent.click(screen.getByRole('button', { name: /ACCURACY DISCLAIMER/ }));
    expect(screen.queryByText(/Latest GPT|Best Value|Most Capable|Cheapest|Latest Sonnet/)).not.toBeInTheDocument();
    expect(screen.getByText(/including any reasoning tokens/)).toBeInTheDocument();
    expect(screen.getByText(/search\/request fees/)).toBeInTheDocument();
    expect(screen.getByText(/provider Batch API discounts are not applied/)).toBeInTheDocument();
    expect(screen.getByText('ESTIMATED COST DIFFERENCE')).toBeInTheDocument();
    expect(screen.queryByText('Claude 3 Haiku')).not.toBeInTheDocument();
  });
});
