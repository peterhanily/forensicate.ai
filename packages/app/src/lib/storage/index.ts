// Storage module exports

export * from './types';
export * from './storage';
export {
  encodeConfig,
  decodeConfig,
  getConfigFromUrl,
  clearUrlConfig,
  generateShareUrl,
  // Legacy exports for backwards compatibility
  encodeConfigToHash,
  decodeHashToConfig,
  clearUrlHash,
} from './urlHash';
