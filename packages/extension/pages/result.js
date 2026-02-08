// Result page script

async function loadResult() {
  try {
    const { lastScanResult, fullScanResult } = await chrome.storage.local.get([
      'lastScanResult',
      'fullScanResult'
    ]);

    if (!lastScanResult) {
      showError('No scan result found');
      return;
    }

    displayResult(lastScanResult, fullScanResult);
  } catch (error) {
    console.error('Failed to load result:', error);
    showError('Failed to load scan result');
  }
}

function displayResult(result, fullResult) {
  const container = document.getElementById('result-container');

  // Determine risk class
  const riskClass = result.confidence < 30 ? 'low' :
                    result.confidence < 70 ? 'medium' : 'high';

  const hasAnnotations = fullResult && fullResult.matchedRules && fullResult.matchedRules.length > 0;

  const html = `
    <div style="text-align: center;">
      <div class="confidence-badge ${riskClass}">
        ${result.confidence}%
      </div>
      <div class="risk-label" style="color: ${getRiskColor(riskClass)}">
        ${result.riskLevel || riskClass} Risk
      </div>
    </div>

    <h2>Scanned Text</h2>
    ${hasAnnotations ? `
      <label class="annotation-toggle">
        <input type="checkbox" id="show-annotations-toggle" />
        <span>Show annotated view</span>
      </label>
    ` : ''}
    <div id="text-display">
      <div class="scanned-text">
        <pre>${escapeHtml(result.text)}</pre>
      </div>
    </div>

    <h2>Matches Found (${result.matchCount})</h2>
    ${result.matchCount > 0 ? `
      <ul class="matches-list">
        ${result.topMatches.map(match => `
          <li class="match-item">
            <div class="match-header">
              <span class="match-name">${escapeHtml(match.ruleName)}</span>
              <span class="severity ${match.severity}">${match.severity}</span>
            </div>
            ${match.matches && match.matches.length > 0 ? `
              <div class="match-examples">
                ${match.matches.map(m => `"${escapeHtml(m)}"`).join(', ')}
              </div>
            ` : ''}
          </li>
        `).join('')}
      </ul>
      ${result.matchCount > 5 ? `
        <p style="text-align: center; color: #9ca3af; font-size: 13px;">
          Showing top 5 of ${result.matchCount} matches
        </p>
      ` : ''}
    ` : `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <p>No threats detected!</p>
      </div>
    `}

    <div class="actions">
      <button class="btn-primary" id="save-to-library-btn">
        💾 Save to Library
      </button>
      <button class="btn-secondary" id="view-full-btn">
        🔍 View Full Report
      </button>
      <button class="btn-secondary" id="close-btn">
        ✕ Close
      </button>
    </div>
  `;

  container.innerHTML = html;

  // Set timestamp
  document.getElementById('timestamp').textContent = new Date().toLocaleString();

  // Add event listeners
  document.getElementById('save-to-library-btn')?.addEventListener('click', () => {
    saveToLibrary(result);
  });

  document.getElementById('view-full-btn')?.addEventListener('click', () => {
    // Create config with prompt text to pass to web app
    const config = {
      version: 1,
      session: {
        promptText: result.text
      }
    };

    // Encode config to base64
    const encoded = btoa(encodeURIComponent(JSON.stringify(config)));

    // Open web app with prompt text loaded
    chrome.tabs.create({ url: `https://forensicate.ai/scanner?config=${encoded}` });
  });

  document.getElementById('close-btn')?.addEventListener('click', () => {
    window.close();
  });

  // Add annotation toggle listener
  const annotationToggle = document.getElementById('show-annotations-toggle');
  if (annotationToggle && fullResult) {
    annotationToggle.addEventListener('change', (e) => {
      const textDisplay = document.getElementById('text-display');
      if (e.target.checked) {
        textDisplay.innerHTML = generateAnnotatedHTML(fullResult);
      } else {
        textDisplay.innerHTML = `
          <div class="scanned-text">
            <pre>${escapeHtml(result.text)}</pre>
          </div>
        `;
      }
    });
  }
}

async function saveToLibrary(result) {
  try {
    // Send message to background to save
    await chrome.runtime.sendMessage({
      type: 'SAVE_TO_LIBRARY',
      prompt: {
        text: result.text,
        confidence: result.confidence,
        matchCount: result.matchCount,
        matchedRules: result.topMatches || [], // Include matched rules for annotations
        sourceUrl: 'manual-scan'
      }
    });

    // Show success
    const btn = document.getElementById('save-to-library-btn');
    btn.textContent = '✅ Saved!';
    btn.disabled = true;
    btn.style.background = '#10b981';

    setTimeout(() => {
      btn.textContent = '💾 Saved to Library';
    }, 2000);
  } catch (error) {
    console.error('Failed to save:', error);
    alert('Failed to save to library');
  }
}

function showError(message) {
  const container = document.getElementById('result-container');
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">❌</div>
      <p>${escapeHtml(message)}</p>
      <button class="btn-secondary error-close-btn" style="margin-top: 16px;">
        Close
      </button>
    </div>
  `;

  // Add event listener after rendering
  document.querySelector('.error-close-btn')?.addEventListener('click', () => {
    window.close();
  });
}

function getRiskColor(riskClass) {
  switch (riskClass) {
    case 'low': return '#10b981';
    case 'medium': return '#f59e0b';
    case 'high': return '#ef4444';
    default: return '#9ca3af';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function generateAnnotatedHTML(fullResult) {
  if (!fullResult || !fullResult.text || !fullResult.matchedRules) {
    return `<div class="scanned-text"><pre>${escapeHtml(fullResult?.text || '')}</pre></div>`;
  }

  // Collect all positions from matched rules
  const segments = [];
  fullResult.matchedRules.forEach(rule => {
    if (rule.positions && rule.positions.length > 0) {
      rule.positions.forEach(pos => {
        segments.push({
          start: pos.start,
          end: pos.end,
          severity: rule.severity,
          ruleName: rule.ruleName
        });
      });
    }
  });

  // Sort segments by start position
  segments.sort((a, b) => a.start - b.start);

  // Merge overlapping segments (take highest severity)
  const mergedSegments = [];
  segments.forEach(segment => {
    if (mergedSegments.length === 0) {
      mergedSegments.push(segment);
      return;
    }

    const last = mergedSegments[mergedSegments.length - 1];
    if (segment.start < last.end) {
      // Overlapping - extend and keep higher severity
      const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
      if (severityRank[segment.severity] > severityRank[last.severity]) {
        last.severity = segment.severity;
        last.ruleName = segment.ruleName;
      }
      last.end = Math.max(last.end, segment.end);
    } else {
      mergedSegments.push(segment);
    }
  });

  // Generate HTML with annotations
  let html = '<div class="annotated-text">';
  let lastIndex = 0;

  mergedSegments.forEach(segment => {
    // Add plain text before this segment
    if (segment.start > lastIndex) {
      html += escapeHtml(fullResult.text.substring(lastIndex, segment.start));
    }

    // Add annotated segment
    const segmentText = fullResult.text.substring(segment.start, segment.end);
    html += `<span class="annotated-segment ${segment.severity}" title="${escapeHtml(segment.ruleName)}">${escapeHtml(segmentText)}</span>`;

    lastIndex = segment.end;
  });

  // Add remaining plain text
  if (lastIndex < fullResult.text.length) {
    html += escapeHtml(fullResult.text.substring(lastIndex));
  }

  html += '</div>';
  return html;
}

// Load result on page load
loadResult();
