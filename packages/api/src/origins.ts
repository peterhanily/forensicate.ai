/** Match serialized HTTP origins against domains, wildcard domains, or exact origins. */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!Array.isArray(allowedOrigins)) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    return false;
  }

  return allowedOrigins.some(entry => {
    if (typeof entry !== 'string') return false;
    const allowed = entry.trim().toLowerCase();
    if (allowed.includes('://')) {
      try { return url.origin === new URL(allowed).origin; } catch { return false; }
    }
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return domain.length > 0 && (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
    }
    return url.hostname === allowed;
  });
}
