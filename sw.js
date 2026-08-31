// Service Worker:预缓存全部文件,离线可玩;更新版本号 V 以刷新缓存
const V = 'pxs-v23';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/sprites.js',
  'js/core/engine.js', 'js/core/camera.js', 'js/core/input.js', 'js/core/save.js', 'js/core/audio.js',
  'js/game/player.js', 'js/game/map.js', 'js/game/particles.js', 'js/game/enemies.js',
  'js/game/weapons.js', 'js/game/spawner.js', 'js/game/boss.js', 'js/game/upgrades.js', 'js/game/pickups.js',
  'js/ui/hud.js', 'js/ui/codex.js', 'js/ui/screens.js', 'js/ui/joystick.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(V);
    await Promise.allSettled(ASSETS.map(a => cache.add(a)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const resp = await fetch(e.request);
      if (resp.ok && e.request.url.startsWith(self.location.origin)) {
        const cache = await caches.open(V);
        cache.put(e.request, resp.clone());
      }
      return resp;
    } catch {
      const fallback = await caches.match('index.html');
      if (fallback) return fallback;
      throw new Error('offline');
    }
  })());
});
