// Popup script for Forensicate.ai extension

// Load stats on popup open
async function loadStats() {
  try {
    const { scanHistory = [], promptLibrary = [] } = await chrome.storage.local.get([
      'scanHistory',
      'promptLibrary'
    ]);

    // Update total scans
    document.getElementById('total-scans').textContent = scanHistory.length;

    // Update saved prompts
    document.getElementById('saved-prompts').textContent = promptLibrary.length;

    // Count by risk level
    const high = promptLibrary.filter(p => p.confidence >= 70).length;
    const medium = promptLibrary.filter(p => p.confidence >= 30 && p.confidence < 70).length;
    const low = promptLibrary.filter(p => p.confidence < 30).length;

    document.getElementById('high-count').textContent = high;
    document.getElementById('medium-count').textContent = medium;
    document.getElementById('low-count').textContent = low;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// Open web app
document.getElementById('open-webapp-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://forensicate.ai/scanner' });
  window.close();
});

// View library
document.getElementById('view-library-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/library.html') });
  window.close();
});

// View history
document.getElementById('view-history-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/history.html') });
  window.close();
});

// Load stats when popup opens
loadStats();

// Refresh stats every 2 seconds while popup is open
setInterval(loadStats, 2000);
