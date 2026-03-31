import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Strip Cloudflare Web Analytics and restrictive CSP from the standalone build.
// The CSP blocks inline scripts which are required when everything is inlined
// into a single HTML file by vite-plugin-singlefile. The 'self' origin is also
// meaningless when opened from a file:// URL.
function stripForStandalone(): Plugin {
  return {
    name: 'strip-for-standalone',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->/g, '')
        .replace(/\s*<!-- Content Security Policy -->\s*\n\s*<meta http-equiv="Content-Security-Policy"[^>]*>/g, '');
    },
  };
}

// Configuration for building a single self-contained HTML file
// Similar to CyberChef's downloadable standalone version
export default defineConfig({
  plugins: [react(), tailwindcss(), stripForStandalone(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'dist-single',
    minify: 'esbuild',
    cssMinify: true,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
})
