import type { VitePWAOptions } from 'vite-plugin-pwa';

export function createPwaOptions(base: string): Partial<VitePWAOptions> {
  if (!base.startsWith('/') || /[?#\\]/.test(base) || base.includes('..') || base.includes('//')) {
    throw new Error('iSense PWA requires a local, absolute artifact base path.');
  }
  const scope = base.endsWith('/') ? base : `${base}/`;
  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    base: scope,
    scope,
    registerType: 'prompt',
    injectRegister: null,
    manifestFilename: 'manifest.webmanifest',
    includeAssets: ['icons/*.png'],
    manifest: {
      id: scope,
      name: 'iSense',
      short_name: 'iSense',
      description: 'Sensory-aware UIUC walking route comparison. Live maps and routing need a network connection.',
      lang: 'en',
      start_url: scope,
      scope,
      display: 'standalone',
      orientation: 'any',
      theme_color: '#fff0e4',
      background_color: '#f3f8fc',
      categories: ['navigation', 'education'],
      icons: [
        { src: `${scope}icons/isense-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${scope}icons/isense-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${scope}icons/isense-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      cacheId: `isense-static-${scope.replace(/\W/g, '-')}`,
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      globIgnores: ['**/*.map'],
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: true,
      navigateFallback: `${scope}index.html`,
      // Only this single-page app's entry points; not /api or other artifacts.
      navigateFallbackAllowlist: [new RegExp(`^${escapedScope}(?:index\\.html)?(?:\\?.*)?$`)],
      runtimeCaching: [],
    },
    // Installing/caching a changing HMR build is misleading. Verify a built app.
    devOptions: { enabled: false },
  };
}
