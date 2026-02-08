// Content script for showing scan results as an overlay bubble
let currentBubble = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_SCAN_RESULT') {
    showScanBubble(message.result, message.fullResult);
    sendResponse({ success: true });
  } else if (message.type === 'HIDE_BUBBLE') {
    hideBubble();
    sendResponse({ success: true });
  }
  return true;
});

function showScanBubble(result, fullResult) {
  // Remove existing bubble
  hideBubble();

  // Get selection position
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Create bubble
  currentBubble = createBubbleElement(result, fullResult);
  document.body.appendChild(currentBubble);

  // Position bubble near selection
  positionBubble(currentBubble, rect);

  // Auto-hide after 30 seconds
  setTimeout(() => hideBubble(), 30000);
}

function createBubbleElement(result, fullResult) {
  const bubble = document.createElement('div');
  bubble.id = 'forensicate-ai-bubble';
  bubble.className = 'forensicate-ai-bubble';

  const riskClass = result.confidence < 30 ? 'low' :
                   result.confidence < 70 ? 'medium' : 'high';

  bubble.innerHTML = `
    <style>
      .forensicate-ai-bubble {
        position: fixed;
        z-index: 2147483647;
        background: #030712;
        border: 2px solid #c9a227;
        border-radius: 12px;
        padding: 16px;
        max-width: 400px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        font-family: system-ui, -apple-system, sans-serif;
        color: #f9fafb;
        animation: forensicate-fadeIn 0.2s ease-out;
      }

      @keyframes forensicate-fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .forensicate-ai-bubble * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .forensicate-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #374151;
      }

      .forensicate-logo {
        font-size: 14px;
        font-weight: 700;
        color: #c9a227;
      }

      .forensicate-close {
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .forensicate-close:hover {
        color: #f9fafb;
      }

      .forensicate-confidence {
        text-align: center;
        margin-bottom: 16px;
      }

      .forensicate-score {
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .forensicate-score.low { color: #10b981; }
      .forensicate-score.medium { color: #f59e0b; }
      .forensicate-score.high { color: #ef4444; }

      .forensicate-risk {
        font-size: 12px;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
      }

      .forensicate-text {
        background: #1f2937;
        border: 1px solid #374151;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 12px;
        max-height: 100px;
        overflow-y: auto;
        font-size: 13px;
        line-height: 1.5;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .forensicate-matches {
        margin-bottom: 12px;
        font-size: 13px;
      }

      .forensicate-matches-title {
        font-weight: 600;
        margin-bottom: 8px;
        color: #e5e7eb;
      }

      .forensicate-match {
        background: #1f2937;
        border: 1px solid #374151;
        border-radius: 6px;
        padding: 8px;
        margin-bottom: 6px;
        font-size: 12px;
      }

      .forensicate-match-name {
        font-weight: 600;
        margin-bottom: 4px;
        color: #f9fafb;
      }

      .forensicate-severity {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        margin-left: 6px;
      }

      .forensicate-severity.critical { background: #ef4444; color: white; }
      .forensicate-severity.high { background: #f97316; color: white; }
      .forensicate-severity.medium { background: #f59e0b; color: white; }
      .forensicate-severity.low { background: #3b82f6; color: white; }

      .forensicate-actions {
        display: flex;
        gap: 8px;
      }

      .forensicate-btn {
        flex: 1;
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .forensicate-btn-primary {
        background: #c9a227;
        color: #030712;
      }

      .forensicate-btn-primary:hover {
        background: #b8911e;
      }

      .forensicate-btn-secondary {
        background: #374151;
        color: #f9fafb;
      }

      .forensicate-btn-secondary:hover {
        background: #4b5563;
      }
    </style>

    <div class="forensicate-header">
      <div class="forensicate-logo">🔍 Forensicate.ai</div>
      <button class="forensicate-close" id="forensicate-close">✕</button>
    </div>

    <div class="forensicate-confidence">
      <div class="forensicate-score ${riskClass}">${result.confidence}%</div>
      <div class="forensicate-risk">${riskClass} Risk</div>
    </div>

    <div class="forensicate-text">${escapeHtml(result.text.substring(0, 200))}${result.text.length > 200 ? '...' : ''}</div>

    ${result.matchCount > 0 ? `
      <div class="forensicate-matches">
        <div class="forensicate-matches-title">🎯 ${result.matchCount} ${result.matchCount === 1 ? 'Match' : 'Matches'} Found</div>
        ${result.topMatches.slice(0, 3).map(match => `
          <div class="forensicate-match">
            <div class="forensicate-match-name">
              ${escapeHtml(match.ruleName)}
              <span class="forensicate-severity ${match.severity}">${match.severity}</span>
            </div>
          </div>
        `).join('')}
        ${result.matchCount > 3 ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">+${result.matchCount - 3} more matches</div>` : ''}
      </div>
    ` : ''}

    <div class="forensicate-actions">
      <button class="forensicate-btn forensicate-btn-secondary" id="forensicate-save">💾 Save</button>
      <button class="forensicate-btn forensicate-btn-secondary" id="forensicate-library">📚 Library</button>
      <button class="forensicate-btn forensicate-btn-primary" id="forensicate-full">🔍 View Full</button>
    </div>
  `;

  // Add event listeners
  bubble.querySelector('#forensicate-close').addEventListener('click', hideBubble);

  bubble.querySelector('#forensicate-save').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'SAVE_TO_LIBRARY',
      prompt: {
        text: result.text,
        confidence: result.confidence,
        matchCount: result.matchCount,
        matchedRules: result.topMatches || [],
        sourceUrl: window.location.href
      }
    });

    const btn = bubble.querySelector('#forensicate-save');
    btn.textContent = '✅ Saved!';
    btn.disabled = true;
    setTimeout(hideBubble, 1500);
  });

  bubble.querySelector('#forensicate-library').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_LIBRARY' });
    hideBubble();
  });

  bubble.querySelector('#forensicate-full').addEventListener('click', async () => {
    // Warn user about data in URL
    const confirmed = confirm(
      'This will open forensicate.ai with your scanned text in the URL.\n\n' +
      'Note: The text will be visible in browser history and may appear in server logs.\n\n' +
      'Continue?'
    );

    if (!confirmed) {
      return;
    }

    // Create minimal valid config with session data
    const config = {
      version: '1',
      savedAt: new Date().toISOString(),
      rules: {
        localRules: [],
        customCategories: []
      },
      prompts: {
        localPrompts: [],
        customPromptCategories: []
      },
      session: {
        promptText: result.text
      }
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(config)));
    window.open(`https://forensicate.ai/scanner?config=${encoded}`, '_blank');
    hideBubble();
  });

  return bubble;
}

function positionBubble(bubble, selectionRect) {
  const bubbleRect = bubble.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Try to position below selection
  let top = selectionRect.bottom + window.scrollY + 10;
  let left = selectionRect.left + window.scrollX + (selectionRect.width / 2) - (bubbleRect.width / 2);

  // If bubble would go off-screen to the right, move it left
  if (left + bubbleRect.width > viewportWidth) {
    left = viewportWidth - bubbleRect.width - 20;
  }

  // If bubble would go off-screen to the left, move it right
  if (left < 20) {
    left = 20;
  }

  // If bubble would go off-screen at bottom, position above selection
  if (top + bubbleRect.height > viewportHeight + window.scrollY) {
    top = selectionRect.top + window.scrollY - bubbleRect.height - 10;
  }

  bubble.style.top = `${top}px`;
  bubble.style.left = `${left}px`;
}

function hideBubble() {
  if (currentBubble) {
    currentBubble.remove();
    currentBubble = null;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Hide bubble when clicking outside
document.addEventListener('click', (e) => {
  if (currentBubble && !currentBubble.contains(e.target)) {
    hideBubble();
  }
}, true);

// Hide bubble when scrolling
let scrollTimeout;
document.addEventListener('scroll', () => {
  if (currentBubble) {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      hideBubble();
    }, 100);
  }
}, true);
