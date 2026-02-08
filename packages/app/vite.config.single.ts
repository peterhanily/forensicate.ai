import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Strip Cloudflare Web Analytics from the standalone build
function stripCloudflareAnalytics(): Plugin {
  return {
    name: 'strip-cloudflare-analytics',
    transformIndexHtml(html) {
      return html.replace(/\s*<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->/g, '');
    },
  };
}

// Configuration for building a single self-contained HTML file
// Similar to CyberChef's downloadable standalone version
export default defineConfig({
  plugins: [react(), tailwindcss(), stripCloudflareAnalytics(), viteSingleFile()],
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
