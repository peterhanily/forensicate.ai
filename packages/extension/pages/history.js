// History page script

async function loadHistory() {
  try {
    const { scanHistory = [] } = await chrome.storage.local.get('scanHistory');

    if (scanHistory.length === 0) {
      showEmptyState();
      return;
    }

    updateStats(scanHistory);
    displayHistory(scanHistory);
  } catch (error) {
    console.error('Failed to load history:', error);
    showError('Failed to load scan history');
  }
}

function updateStats(history) {
  document.getElementById('total-scans').textContent = history.length;

  // Calculate average confidence
  if (history.length > 0) {
    const avgConfidence = Math.round(
      history.reduce((sum, item) => sum + (item.confidence || 0), 0) / history.length
    );
    document.getElementById('avg-confidence').textContent = avgConfidence + '%';
  } else {
    document.getElementById('avg-confidence').textContent = '0%';
  }

  // Count high risk scans
  const highRiskCount = history.filter(item => item.confidence >= 70).length;
  document.getElementById('high-risk-count').textContent = highRiskCount;
}

function displayHistory(history) {
  const container = document.getElementById('history-container');

  container.innerHTML = `
    <div class="history-list">
      ${history.map((item, index) => createHistoryItem(item, index)).join('')}
    </div>
  `;
}

function createHistoryItem(item, index) {
  const riskClass = item.confidence < 30 ? 'low' :
                   item.confidence < 70 ? 'medium' : 'high';

  const date = new Date(item.timestamp).toLocaleString();

  return `
    <div class="history-item">
      <div class="history-content">
        <div class="history-text">${escapeHtml(item.text || 'No text')}</div>
        <div class="history-meta">
          <span>📅 ${date}</span>
          <span>🎯 ${item.matchCount || 0} matches</span>
          ${item.sourceUrl ? `<span>🔗 ${escapeHtml(item.sourceUrl)}</span>` : ''}
        </div>
        <div class="history-actions">
          <button class="btn-small btn-primary" onclick="saveToLibrary(${index})">💾 Save to Library</button>
        </div>
      </div>
      <div class="confidence-pill ${riskClass}">
        ${item.confidence}%
      </div>
    </div>
  `;
}

function showEmptyState() {
  const container = document.getElementById('history-container');
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <h2>No scan history</h2>
      <p>Your recent scans will appear here.</p>
    </div>
  `;

  // Clear stats
  document.getElementById('total-scans').textContent = '0';
  document.getElementById('avg-confidence').textContent = '0%';
  document.getElementById('high-risk-count').textContent = '0';
}

function showError(message) {
  const container = document.getElementById('history-container');
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">❌</div>
      <h2>Error</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

async function clearHistory() {
  if (!confirm('Clear all scan history? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.storage.local.set({ scanHistory: [] });
    showEmptyState();
  } catch (error) {
    console.error('Failed to clear history:', error);
    alert('Failed to clear history');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Save history item to prompt library
async function saveToLibrary(index) {
  try {
    const { scanHistory = [] } = await chrome.storage.local.get('scanHistory');

    if (index < 0 || index >= scanHistory.length) {
      alert('History item not found');
      return;
    }

    const historyItem = scanHistory[index];

    // Send message to background script to save to library
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_TO_LIBRARY',
      prompt: {
        text: historyItem.text,
        confidence: historyItem.confidence,
        matchCount: historyItem.matchCount,
        matchedRules: historyItem.matchedRules || [],
        sourceUrl: historyItem.sourceUrl
      }
    });

    if (response && response.success) {
      alert('✅ Saved to Prompt Library!');
    } else {
      alert('❌ Failed to save to library');
    }
  } catch (error) {
    console.error('Failed to save to library:', error);
    alert('❌ Failed to save to library');
  }
}

// Make saveToLibrary globally accessible
window.saveToLibrary = saveToLibrary;

// Event listeners
document.getElementById('clear-history-btn')?.addEventListener('click', clearHistory);

// Load history on page load
loadHistory();
