/**
 * LocalChat Service Worker
 * 2025 optimized with proper caching strategies
 */

const CACHE_NAME = 'localchat-v1';
const STATIC_CACHE = 'localchat-static-v1';
const DYNAMIC_CACHE = 'localchat-dynamic-v1';

// Assets to precache
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/state.js',
  './js/storage.js',
  './js/webrtc.js',
  './js/qrscanner.js',
  './js/app.js'
];

// CDN assets with versioning
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
];

// Cache strategies
const CACHE_STRATEGIES = {
  STATIC: 'cache-first',
  DYNAMIC: 'network-first',
  CDN: 'cache-first'
};

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      const cdnCache = await caches.open(DYNAMIC_CACHE);
      
      // Cache static assets
      await staticCache.addAll(STATIC_ASSETS);
      console.log('[SW] Static assets cached');
      
      // Pre-cache CDN assets
      await cdnCache.addAll(CDN_ASSETS).catch(err => {
        console.warn('[SW] CDN cache failed (offline):', err.message);
      });
      console.log('[SW] CDN assets cached');
      
      // Skip waiting to activate immediately
      await self.skipWaiting();
    })()
  );
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
      
      // Take control of all clients immediately
      await self.clients.claim();
      console.log('[SW] Activated and controlling clients');
    })()
  );
});

// ==================== FETCH ====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;
  
  // Handle different request types
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
  } else if (isCDNAsset(url)) {
    event.respondWith(cacheFirst(DYNAMIC_CACHE, request));
  } else if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

// ==================== CACHE STRATEGIES ====================

// Cache-first: Try cache, fall back to network
async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.warn(`[SW] Cache-first failed for ${request.url}:`, error.message);
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Network-first: Try network, fall back to cache
async function networkFirst(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('./index.html') || new Response('Offline', { status: 503 });
    }
    
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ==================== HELPERS ====================

function isStaticAsset(url) {
  const path = url.pathname;
  return path.endsWith('.css') || 
         path.endsWith('.js') || 
         path.endsWith('.json') ||
         path.endsWith('.png') ||
         path.endsWith('.svg') ||
         path.endsWith('.ico');
}

function isCDNAsset(url) {
  return url.hostname.includes('cdn.jsdelivr.net') ||
         url.hostname.includes('unpkg.com');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
         (request.mode === 'same-origin' && request.destination === 'document');
}

// ==================== BACKGROUND SYNC ====================

self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // Get pending messages from IndexedDB and sync
  console.log('[SW] Syncing pending messages...');
  // Implementation would depend on app-specific needs
}

// ==================== PUSH NOTIFICATIONS ====================

self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  const data = event.data?.json() || {};
  const title = data.title || 'LocalChat';
  const options = {
    body: data.body || 'New message',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-72.png',
    tag: data.tag || 'default',
    data: data.url || '/',
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Dismiss' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'close') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window or open new one
      for (const client of clientList) {
        if (client.url === event.notification.data && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data);
      }
    })
  );
});

// ==================== MESSAGE HANDLER ====================

self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      (async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[SW] All caches cleared');
      })()
    );
  }
});

console.log('[SW] Loaded');
