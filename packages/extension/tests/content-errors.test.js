import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let onMessage;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.body.replaceChildren();
  await import('../src/content.js');
  onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
});

afterEach(() => {
  onMessage({ type: 'HIDE_BUBBLE' }, {}, () => {});
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('shows a dismissible Not scanned alert even when no text remains selected', () => {
  window.getSelection().removeAllRanges();
  onMessage({ type: 'SHOW_SCAN_ERROR', message: 'Select less than 100,000 UTF-16 code units.' }, {}, () => {});
  const alert = document.querySelector('[role="alert"]');
  expect(alert.textContent).toContain('Not scanned');
  expect(alert.textContent).toContain('100,000 UTF-16 code units');
  expect(alert.querySelector('.forensicate-score')).toBeNull();
  alert.querySelector('button').click();
  expect(document.querySelector('#forensicate-ai-bubble')).toBeNull();
});

it('replaces a successful scan bubble and cancels its pending hide timer', () => {
  vi.spyOn(window, 'getSelection').mockReturnValue({
    rangeCount: 1,
    getRangeAt: () => ({ getBoundingClientRect: () => ({ top: 20, bottom: 40, left: 20, width: 80 }) }),
  });
  onMessage({ type: 'SHOW_SCAN_RESULT', result: { text: 'A meeting agenda.', confidence: 0, matchCount: 0, topMatches: [] } }, {}, () => {});
  expect(document.querySelector('.forensicate-score').textContent).toBe('0%');

  onMessage({ type: 'SHOW_SCAN_ERROR', message: 'Text too long.' }, {}, () => {});
  expect(document.querySelectorAll('#forensicate-ai-bubble')).toHaveLength(1);
  expect(document.querySelector('.forensicate-score')).toBeNull();
  vi.advanceTimersByTime(30_000);
  expect(document.querySelector('[role="alert"]').textContent).toContain('Text too long.');
});

it('renders error details as text', () => {
  onMessage({ type: 'SHOW_SCAN_ERROR', message: '<b>Details</b>' }, {}, () => {});
  const alert = document.querySelector('[role="alert"]');
  expect(alert.textContent).toContain('<b>Details</b>');
  expect(alert.querySelector('b')).toBeNull();
});
