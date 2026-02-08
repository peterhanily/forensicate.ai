// Library page script

let allPrompts = [];
let currentFilter = 'all';

// Custom modal functions to replace native confirm/alert
function showModal(title, message, buttons) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const buttonsEl = document.getElementById('modal-buttons');

    titleEl.textContent = title;
    messageEl.textContent = message;
    buttonsEl.innerHTML = '';

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.textContent = btn.text;
      button.className = btn.className;
      button.addEventListener('click', () => {
        modal.classList.remove('show');
        resolve(btn.value);
      });
      buttonsEl.appendChild(button);
    });

    modal.classList.add('show');

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
        resolve(false);
      }
    });
  });
}

function customConfirm(message) {
  return showModal('Confirm', message, [
    { text: 'Cancel', className: 'btn-secondary', value: false },
    { text: 'Confirm', className: 'btn-danger', value: true }
  ]);
}

function customAlert(message) {
  return showModal('Notice', message, [
    { text: 'OK', className: 'btn-primary', value: true }
  ]);
}

async function loadLibrary() {
  try {
    const { promptLibrary = [] } = await chrome.storage.local.get('promptLibrary');

    allPrompts = promptLibrary.sort((a, b) => b.timestamp - a.timestamp);
    updateStats();
    displayPrompts();
  } catch (error) {
    console.error('Failed to load library:', error);
    showError('Failed to load library');
  }
}

function updateStats() {
  document.getElementById('total-count').textContent = allPrompts.length;
  document.getElementById('high-count').textContent = allPrompts.filter(p => p.confidence >= 70).length;
  document.getElementById('medium-count').textContent = allPrompts.filter(p => p.confidence >= 30 && p.confidence < 70).length;
  document.getElementById('low-count').textContent = allPrompts.filter(p => p.confidence < 30).length;
}

function displayPrompts() {
  const container = document.getElementById('library-container');

  let filteredPrompts = allPrompts;

  if (currentFilter === 'high') {
    filteredPrompts = allPrompts.filter(p => p.confidence >= 70);
  } else if (currentFilter === 'medium') {
    filteredPrompts = allPrompts.filter(p => p.confidence >= 30 && p.confidence < 70);
  } else if (currentFilter === 'low') {
    filteredPrompts = allPrompts.filter(p => p.confidence < 30);
  }

  if (filteredPrompts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h2>No prompts saved</h2>
        <p>Saved prompts will appear here.<br>Scan text and click "Save to Library" to add prompts.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="library-grid">
      ${filteredPrompts.map(prompt => createPromptCard(prompt)).join('')}
    </div>
  `;

  // Add event listeners to all buttons
  filteredPrompts.forEach(prompt => {
    document.getElementById(`delete-${prompt.id}`)?.addEventListener('click', () => {
      deletePrompt(prompt.id);
    });

    document.getElementById(`rescan-${prompt.id}`)?.addEventListener('click', () => {
      rescanPrompt(prompt.text);
    });

    // Toggle rule details
    document.getElementById(`toggle-rules-${prompt.id}`)?.addEventListener('click', (e) => {
      const detailsEl = document.getElementById(`rule-details-${prompt.id}`);
      const isShowing = detailsEl.classList.contains('show');
      detailsEl.classList.toggle('show');
      e.target.textContent = isShowing ? '📋 Show Rule Details' : '📋 Hide Rule Details';
    });
  });
}

function createPromptCard(prompt) {
  const riskClass = prompt.confidence < 30 ? 'low' :
                   prompt.confidence < 70 ? 'medium' : 'high';

  const date = new Date(prompt.timestamp).toLocaleString();
  const hasRules = prompt.matchedRules && prompt.matchedRules.length > 0;

  return `
    <div class="prompt-card">
      <div class="card-header">
        <div class="confidence-badge ${riskClass}">
          ${prompt.confidence}% confidence
        </div>
        <div class="card-meta">
          <span>📅 ${date}</span>
          <span>🎯 ${prompt.matchCount || 0} matches</span>
        </div>
      </div>

      <div class="prompt-text">${escapeHtml(prompt.text)}</div>

      ${prompt.sourceUrl ? `
        <div class="source-link">
          🔗 Source: <a href="${escapeHtml(prompt.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(prompt.sourceUrl)}</a>
        </div>
      ` : ''}

      ${hasRules ? `
        <div class="matched-rules">
          <div class="matched-rules-header">🎯 Matched Detection Rules:</div>
          <div>
            ${prompt.matchedRules.slice(0, 5).map(rule => `
              <span class="rule-tag ${rule.severity}">${escapeHtml(rule.ruleName || rule.ruleId)}</span>
            `).join('')}
            ${prompt.matchedRules.length > 5 ? `<span style="font-size: 11px; color: #9ca3af;">+${prompt.matchedRules.length - 5} more</span>` : ''}
          </div>
          <button class="toggle-rules-btn" id="toggle-rules-${prompt.id}">
            📋 Show Rule Details
          </button>
          <div class="rule-details" id="rule-details-${prompt.id}">
            ${prompt.matchedRules.slice(0, 10).map(rule => `
              <div class="rule-match">
                <div class="rule-match-name">
                  ${escapeHtml(rule.ruleName || rule.ruleId)}
                  <span class="rule-tag ${rule.severity}" style="margin-left: 8px;">${rule.severity}</span>
                </div>
                ${rule.matches && rule.matches.length > 0 ? `
                  <div class="rule-match-examples">
                    Matches: ${rule.matches.map(m => `"${escapeHtml(m)}"`).join(', ')}
                  </div>
                ` : ''}
              </div>
            `).join('')}
            ${prompt.matchedRules.length > 10 ? `
              <div style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 8px;">
                Showing 10 of ${prompt.matchedRules.length} rules
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <div class="card-actions">
        <button class="btn-secondary" id="rescan-${prompt.id}">🔍 Re-scan</button>
        <button class="btn-danger" id="delete-${prompt.id}">🗑️ Delete</button>
      </div>
    </div>
  `;
}

async function deletePrompt(promptId) {
  const confirmed = await customConfirm('Delete this prompt from your library?');
  if (!confirmed) {
    return;
  }

  try {
    const { promptLibrary = [] } = await chrome.storage.local.get('promptLibrary');
    const updatedLibrary = promptLibrary.filter(p => p.id !== promptId);

    await chrome.storage.local.set({ promptLibrary: updatedLibrary });

    // Reload
    await loadLibrary();
  } catch (error) {
    console.error('Failed to delete prompt:', error);
    await customAlert('Failed to delete prompt');
  }
}

async function rescanPrompt(text) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SCAN_TEXT',
      text: text
    });

    if (response.success) {
      // Store result and open result page
      await chrome.storage.local.set({
        lastScanResult: {
          text: text.substring(0, 1000),
          textLength: text.length,
          confidence: response.result.confidence,
          riskLevel: response.result.riskLevel,
          matchCount: response.result.matchedRules.length,
          topMatches: response.result.matchedRules.slice(0, 5).map(m => ({
            ruleId: m.ruleId,
            ruleName: m.ruleName,
            severity: m.severity,
            matches: m.matches?.slice(0, 3),
            confidenceImpact: m.confidenceImpact
          }))
        }
      });

      // Open result in new tab
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/result.html') });
    } else {
      await customAlert('Scan failed: ' + response.error);
    }
  } catch (error) {
    console.error('Failed to rescan:', error);
    await customAlert('Failed to rescan prompt');
  }
}

async function clearAll() {
  const confirmed = await customConfirm(`Delete all ${allPrompts.length} prompts from your library? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  try {
    await chrome.storage.local.set({ promptLibrary: [] });
    await loadLibrary();
  } catch (error) {
    console.error('Failed to clear library:', error);
    await customAlert('Failed to clear library');
  }
}

function showError(message) {
  const container = document.getElementById('library-container');
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">❌</div>
      <h2>Error</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

async function exportToWebApp() {
  if (allPrompts.length === 0) {
    await customAlert('No prompts to export. Save some prompts first.');
    return;
  }

  const confirmed = await customConfirm(`Export ${allPrompts.length} prompts to forensicate.ai Test Battery?\n\nThey will be added to "Extension Snippets" section (persists until you clear browser cache).`);
  if (!confirmed) {
    return;
  }

  try {
    // Sort prompts by timestamp to find the latest one
    const sortedPrompts = [...allPrompts].sort((a, b) => b.timestamp - a.timestamp);
    const latestPrompt = sortedPrompts[0];

    // Convert prompts to test battery format with detailed metadata
    const exportData = {
      categoryName: 'Extension Snippets',
      categoryDescription: `${allPrompts.length} prompts captured from browser extension`,
      prompts: allPrompts.map(prompt => {
        const date = new Date(prompt.timestamp).toLocaleString();
        const sourceUrl = prompt.sourceUrl || 'Unknown source';

        // Extract domain from URL for cleaner display
        let sourceDomain = sourceUrl;
        try {
          if (sourceUrl.startsWith('http')) {
            sourceDomain = new URL(sourceUrl).hostname;
          }
        } catch (e) {
          // Use as-is if not a valid URL
        }

        // Create descriptive name showing source and date
        const shortSource = sourceDomain.length > 30 ? sourceDomain.substring(0, 27) + '...' : sourceDomain;
        const riskLevel = prompt.confidence >= 70 ? 'high' : prompt.confidence >= 30 ? 'medium' : 'low';

        return {
          id: prompt.id,
          name: `${shortSource} · ${date}`,
          content: prompt.text,
          tags: [
            riskLevel,
            'extension',
            sourceUrl !== 'Unknown source' ? 'web-capture' : 'manual-scan'
          ],
          // Keep metadata for reference
          metadata: {
            timestamp: prompt.timestamp,
            sourceUrl: sourceUrl,
            confidence: prompt.confidence,
            matchCount: prompt.matchCount,
            matchedRules: prompt.matchedRules || []
          }
        };
      })
    };

    // Create full config with test battery AND latest prompt in input
    const config = {
      version: '1',
      savedAt: new Date().toISOString(),
      rules: {
        localRules: [],
        customCategories: []
      },
      prompts: {
        localPrompts: [],  // Keep default sample prompts
        customPromptCategories: [{
          id: 'extension-snippets',
          name: 'Extension Snippets',
          description: exportData.categoryDescription,
          source: 'chrome-extension',
          prompts: exportData.prompts
        }]
      },
      session: {
        promptText: latestPrompt.text  // Load latest prompt into input
      }
    };

    // Encode config to base64
    const encoded = btoa(encodeURIComponent(JSON.stringify(config)));

    // Open web app with config
    const webAppUrl = `https://forensicate.ai/scanner?config=${encoded}`;

    // Create tab with the data
    await chrome.tabs.create({ url: webAppUrl });

    // Show success message
    const btn = document.getElementById('export-to-webapp-btn');
    const originalText = btn.textContent;
    btn.textContent = '✅ Exported!';
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 3000);

  } catch (error) {
    console.error('Failed to export:', error);
    await customAlert('Failed to export prompts. Error: ' + error.message);
  }
}

// Event listeners
document.getElementById('view-history-btn')?.addEventListener('click', () => {
  window.location.href = 'history.html';
});
document.getElementById('refresh-btn')?.addEventListener('click', () => window.location.reload());
document.getElementById('clear-all-btn')?.addEventListener('click', clearAll);
document.getElementById('export-to-webapp-btn')?.addEventListener('click', exportToWebApp);

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Update active tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update filter
    currentFilter = tab.dataset.filter;
    displayPrompts();
  });
});

// Load library on page load
loadLibrary();
