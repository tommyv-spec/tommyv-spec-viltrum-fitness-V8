const CACHE_NAME = 'viltrum-fitness-v7.1.0';
const RUNTIME_CACHE = 'viltrum-runtime-v7.1.0';
const PRELOAD_CACHE = 'viltrum-preload-v7.1.0';

const urlsToCache = [
  './',
  './index.html',
  
  // Pages
  './pages/dashboard.html',
  './pages/dashboard-v7.html',
  './pages/plan-view.html',
  './pages/workout.html',
  './pages/nutrition.html',
  './pages/workout-completion.html',
  './pages/profile.html',
  
  // JavaScript - Core
  './js/config.js',
  './js/state.js',
  './js/auth.js',
  './js/access-control.js',
  './js/workout.js',
  './js/session-cache.js',
  './js/offline-preloader.js',
  './js/data-preloader.js',
  './js/preload-modal.js',
  './viewport.js',
  
  // JavaScript - Features
  './js/workout-history.js',
  './js/profile-manager.js',
  './js/welcome-modal.js',
  './js/enhanced-settings.js',
  './js/updated-training-data.js',
  './js/nutrition-app.js',
  './js/nutrition-engine.js',
  './js/training-selector.js',
  
  // CSS
  './css/main.css',
  './css/access-control.css',
  './css/nutrition.css',
  './css/features.css',
  './css/welcome-modal.css',
  
  // Data
  './food-database.json',
  './manifest.json',
  
  // Icons
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',
  
  // External resources (for offline)
  'https://fonts.googleapis.com/css2?family=Staatliches&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// ═══════════════════════════════════════════════════════════════════════════
// BACKGROUND PRELOAD STATE
// ═══════════════════════════════════════════════════════════════════════════
let preloadInProgress = false;
let preloadAborted = false;

// ═══════════════════════════════════════════════════════════════════════════
// INSTALL EVENT
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing v7.1.0...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell v7.1.0');
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[Service Worker] Failed to cache ${url}:`, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('[Service Worker] Install complete - forcing activation');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Cache failed:', error);
      })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER - Receive preload commands from pages
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};
  
  if (type === 'SKIP_WAITING') {
    console.log('[Service Worker] Received SKIP_WAITING message');
    self.skipWaiting();
    return;
  }
  
  if (type === 'START_PRELOAD') {
    console.log('[Service Worker] Received START_PRELOAD command');
    event.waitUntil(handleBackgroundPreload(data));
    return;
  }
  
  if (type === 'CHECK_PRELOAD_STATUS') {
    // Check if preload is complete for this user
    event.waitUntil(
      checkPreloadStatus(data.email).then(status => {
        event.source.postMessage({
          type: 'PRELOAD_STATUS',
          ...status
        });
      })
    );
    return;
  }
  
  if (type === 'GET_PRELOAD_STATUS') {
    // Respond with current preload status
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        inProgress: preloadInProgress,
        aborted: preloadAborted
      });
    }
    return;
  }
  
  if (type === 'ABORT_PRELOAD') {
    console.log('[Service Worker] Received ABORT_PRELOAD command');
    preloadAborted = true;
    return;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CHECK PRELOAD STATUS
// ═══════════════════════════════════════════════════════════════════════════
async function checkPreloadStatus(email) {
  try {
    const cache = await caches.open(PRELOAD_CACHE);
    const statusResponse = await cache.match('preload-status');
    
    if (!statusResponse) {
      return { complete: false, reason: 'no_status' };
    }
    
    const status = await statusResponse.json();
    
    // Check if it's for the same user
    if (status.email !== email) {
      return { complete: false, reason: 'different_user', cachedEmail: status.email };
    }
    
    // Check if cache is fresh (less than 7 days old)
    const ageInDays = (Date.now() - status.completedAt) / (1000 * 60 * 60 * 24);
    if (ageInDays > 7) {
      return { complete: false, reason: 'cache_expired', ageInDays };
    }
    
    return { 
      complete: true, 
      email: status.email,
      completedAt: status.completedAt,
      imagesLoaded: status.imagesLoaded,
      audioLoaded: status.audioLoaded,
      ageInDays: ageInDays.toFixed(1)
    };
  } catch (e) {
    return { complete: false, reason: 'error', error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKGROUND PRELOAD HANDLER
// ═══════════════════════════════════════════════════════════════════════════
async function handleBackgroundPreload(data) {
  if (preloadInProgress) {
    console.log('[Service Worker] Preload already in progress, skipping');
    return;
  }
  
  const { email, imageUrls, audioTexts, ttsUrl } = data;
  
  if (!email || !imageUrls || !audioTexts) {
    console.log('[Service Worker] Invalid preload data');
    return;
  }
  
  // Check if already complete
  const status = await checkPreloadStatus(email);
  if (status.complete) {
    console.log(`[Service Worker] Preload already complete for ${email} (${status.ageInDays} days ago)`);
    // Notify clients
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'PRELOAD_ALREADY_COMPLETE',
          ...status
        });
      });
    });
    return;
  }
  
  preloadInProgress = true;
  preloadAborted = false;
  
  console.log(`[Service Worker] Starting background preload for ${email}`);
  console.log(`[Service Worker] Images: ${imageUrls.length}, Audio: ${audioTexts.length}`);
  
  const cache = await caches.open(PRELOAD_CACHE);
  let imagesLoaded = 0;
  let audioLoaded = 0;
  let imagesSkipped = 0;
  let audioSkipped = 0;
  
  // Broadcast progress to all clients
  const broadcastProgress = (phase, current, total) => {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'PRELOAD_PROGRESS',
          phase,
          current,
          total,
          percent: Math.round((current / total) * 100)
        });
      });
    });
  };
  
  try {
    // 1. Preload Images
    for (let i = 0; i < imageUrls.length; i++) {
      if (preloadAborted) {
        console.log('[Service Worker] Preload aborted');
        break;
      }
      
      const url = imageUrls[i];
      
      try {
        // Check if already cached
        const cached = await cache.match(url);
        if (cached) {
          imagesSkipped++;
        } else {
          const response = await fetch(url, { mode: 'cors' });
          if (response.ok) {
            await cache.put(url, response);
            imagesLoaded++;
          }
        }
      } catch (e) {
        // Skip failed images
      }
      
      // Broadcast progress every 5 images
      if (i % 5 === 0 || i === imageUrls.length - 1) {
        broadcastProgress('images', i + 1, imageUrls.length);
      }
    }
    
    console.log(`[Service Worker] Images: ${imagesLoaded} loaded, ${imagesSkipped} already cached`);
    
    // 2. Preload TTS Audio
    if (!preloadAborted && ttsUrl) {
      for (let i = 0; i < audioTexts.length; i++) {
        if (preloadAborted) break;
        
        const text = audioTexts[i];
        const cacheKey = `tts:${text}`;
        
        try {
          const cached = await cache.match(cacheKey);
          if (cached) {
            audioSkipped++;
          } else {
            // Use POST for TTS server
            const response = await fetch(ttsUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: text, lang: 'it-IT' })
            });
            if (response.ok) {
              // Store with text as key for easy retrieval
              await cache.put(cacheKey, response);
              audioLoaded++;
            }
          }
        } catch (e) {
          // Skip failed audio silently
        }
        
        // Broadcast progress every 10 audio files
        if (i % 10 === 0 || i === audioTexts.length - 1) {
          broadcastProgress('audio', i + 1, audioTexts.length);
        }
        
        // Rate limit
        if (i % 3 === 0) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
      
      console.log(`[Service Worker] Audio: ${audioLoaded} loaded, ${audioSkipped} already cached`);
    }
    
    // 3. Mark preload complete
    if (!preloadAborted) {
      // Store completion marker
      const completionData = new Response(JSON.stringify({
        email: email,
        completedAt: Date.now(),
        imagesLoaded: imagesLoaded + imagesSkipped,
        audioLoaded: audioLoaded + audioSkipped
      }));
      await cache.put('preload-status', completionData);
      
      // Broadcast completion
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'PRELOAD_COMPLETE',
            email,
            imagesLoaded: imagesLoaded + imagesSkipped,
            audioLoaded: audioLoaded + audioSkipped
          });
        });
      });
      
      console.log('[Service Worker] Background preload complete!');
    }
    
  } catch (error) {
    console.error('[Service Worker] Preload error:', error);
    // Broadcast error
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'PRELOAD_ERROR',
          error: error.message
        });
      });
    });
  } finally {
    preloadInProgress = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVATE EVENT
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating v7.1.0...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Keep current caches and preload cache
          if (cacheName !== CACHE_NAME && 
              cacheName !== RUNTIME_CACHE && 
              cacheName !== PRELOAD_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Activated - taking control');
      return self.clients.claim();
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// FETCH EVENT
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Check preload cache first for Google images
  if (url.href.includes('googleusercontent.com') || 
      url.href.includes('drive.google.com') ||
      url.href.includes('lh3.google')) {
    event.respondWith(
      caches.open(PRELOAD_CACHE).then(cache => {
        return cache.match(request).then(cachedResponse => {
          if (cachedResponse) {
            console.log('[Service Worker] Serving preloaded image');
            return cachedResponse;
          }
          return fetch(request).then(response => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => {
            return new Response('Offline', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // CRITICAL FIX: Skip ALL navigation requests
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { redirect: 'manual' })
        .then(response => {
          if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
            return response;
          }
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(error => {
          return caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Skip auth requests
  if (url.searchParams.has('access_token') || 
      url.searchParams.has('refresh_token') || 
      url.searchParams.has('type') ||
      url.searchParams.has('token_hash') ||
      url.searchParams.has('code')) {
    return;
  }

  // Handle external CDN domains
  if (url.origin !== self.location.origin) {
    if (url.origin.includes('cdn.jsdelivr.net') ||
        url.origin.includes('fonts.googleapis.com') ||
        url.origin.includes('fonts.gstatic.com')) {
      event.respondWith(
        caches.match(request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              return caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, response.clone());
                return response;
              });
            }
            return response;
          }).catch(() => {
            return new Response('Offline', { status: 503 });
          });
        })
      );
    }
    return;
  }

  // Cache-first for app resources
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(RUNTIME_CACHE).then(cache => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {});
          return response;
        }
        
        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE)
            .then((cache) => {
              cache.put(request, responseToCache);
            });

          return response;
        });
      })
      .catch((error) => {
        return new Response('Offline - Resource not available', { 
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});