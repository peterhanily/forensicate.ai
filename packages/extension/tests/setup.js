// Test setup for Chrome extension tests

import { vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
  runtime: {
    onInstalled: {
      addListener: vi.fn()
    },
    onStartup: {
      addListener: vi.fn()
    },
    onMessage: {
      addListener: vi.fn()
    },
    sendMessage: vi.fn(),
    getURL: vi.fn((path) => `chrome-extension://fake-id/${path}`)
  },
  contextMenus: {
    create: vi.fn(),
    removeAll: vi.fn((callback) => callback && callback()),
    onClicked: {
      addListener: vi.fn()
    }
  },
  commands: {
    onCommand: {
      addListener: vi.fn()
    }
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      getBytesInUse: vi.fn().mockResolvedValue(1024),
      QUOTA_BYTES: 10485760 // 10MB
    }
  },
  windows: {
    create: vi.fn().mockResolvedValue({ id: 1 }),
    get: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({ id: 1 }),
    onRemoved: {
      addListener: vi.fn()
    }
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
    sendMessage: vi.fn().mockResolvedValue({ success: true })
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([{ result: 'selected text' }])
  },
  notifications: {
    create: vi.fn(),
    onButtonClicked: {
      addListener: vi.fn()
    }
  },
  alarms: {
    create: vi.fn(),
    onAlarm: {
      addListener: vi.fn()
    }
  }
};
