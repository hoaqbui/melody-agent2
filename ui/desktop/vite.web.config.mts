import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const PWA_ICON = 'icon-512.png';

// The browser build reuses index.html unchanged: the shim is prepended as the first module
// import so window.electron exists before renderer.tsx evaluates, and the PWA manifest and
// icon are added here rather than to the Electron renderer's HTML.
function webShell(): Plugin {
  return {
    name: 'goose-web-shell',
    transformIndexHtml: {
      // 'pre' runs before Vite's own HTML pass, so the injected .ts script is bundled.
      order: 'pre',
      handler: () => [
        {
          tag: 'script',
          attrs: { type: 'module', src: './src/shims/electron-web.ts' },
          injectTo: 'body-prepend',
        },
        {
          tag: 'link',
          attrs: { rel: 'manifest', href: './manifest.webmanifest' },
          injectTo: 'head',
        },
        {
          tag: 'link',
          attrs: { rel: 'apple-touch-icon', href: `./${PWA_ICON}` },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: {
            name: 'viewport',
            content: 'width=device-width, initial-scale=1, viewport-fit=cover',
          },
          injectTo: 'head',
        },
      ],
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: PWA_ICON,
        source: readFileSync(new URL(`./src/images/${PWA_ICON}`, import.meta.url)),
      });
    },
  };
}

// https://vitejs.dev/config
export default defineConfig({
  base: './',
  define: {
    // Path helpers branch on the host that owns the files: the sidecar's Mac, which is also
    // where this build runs.
    'process.platform': JSON.stringify(process.platform),
  },
  plugins: [tailwindcss(), webShell()],
  build: {
    target: 'esnext',
    outDir: 'dist-web',
    emptyOutDir: true,
  },
});
