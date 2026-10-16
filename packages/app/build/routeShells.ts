import type { Plugin } from 'vite';
import { routePaths } from '../src/routePaths.ts';

/** Give static hosts real entry files for the app's known routes. */
export function routeShells(): Plugin {
  return {
    name: 'static-route-shells',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entry = bundle['index.html'];
      if (!entry || entry.type !== 'asset') this.error('Missing built index.html for route shells');
      const html = typeof entry.source === 'string' ? entry.source : new TextDecoder().decode(entry.source);
      for (const route of Object.values(routePaths)) {
        // Assets are root-relative, so nested entries keep the same tested JS.
        // No redirect is needed: the browser retains its query and fragment.
        const source = html.replace(
          /(<link rel="canonical" href="|<meta (?:property="og:url"|name="twitter:url") content=")https:\/\/forensicate\.ai\/"/g,
          `$1https://forensicate.ai/${route}/"`,
        );
        this.emitFile({ type: 'asset', fileName: `${route}/index.html`, source });
      }
    },
  };
}
