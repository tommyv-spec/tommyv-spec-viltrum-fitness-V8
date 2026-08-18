const CACHE_NAME = 'viltrum-fitness-v8.2.71';
const RUNTIME_CACHE = 'viltrum-runtime-v8.2.71';
// UNVERSIONED on purpose, and named so deploy.ps1's version-bump regex
// (viltrum-preload-vX.Y.Z) can never touch it again. This was versioned and bumped
// every release, and activate deletes non-current preload caches — so every deploy
// silently wiped the user's whole offline pack (all preloaded workout images+audio)
// and the next app entry re-downloaded everything: the "app reloads everything every
// time I open it" report. The content is immutable; preload-status carries its own
// per-user and 7-day invalidation, which is the correct freshness mechanism.
const PRELOAD_CACHE = 'viltrum-preload-static-v1';
// Instructor voice clips. Intentionally NOT version-suffixed and never purged on
// activate: the mp3s are immutable, so re-downloading them each release is waste.
const AUDIO_CACHE = 'viltrum-audio-v1';
// Exercise GIF bytes, warmed by workout.js. Same rationale: immutable, unversioned.
const GIF_CACHE = 'viltrum-gif-v1';
const BUILD_HASH = '20260818225437';

const urlsToCache = [
  './',
  './index.html',

  // SFX — local WAV. Precached so a beep never waits on the network, and so bip mode
  // keeps working offline.
  './audio/beep.wav',
  './audio/transition.wav',
  './audio/silence.wav',
  './audio/wake.mp4',

  // Pages
  './pages/dashboard-v7.html',
  './pages/plan-view.html',
  './pages/workout.html',
  './pages/endurance.html',
  './pages/nutrition.html',
  './pages/workout-completion.html',
  './pages/profile.html',
  './pages/questionario.html',
  
  // JavaScript - Core
  // v9 cleanup: dead modules dropped (state.js, access-control.js,
  // welcome-modal.js, enhanced-settings.js, updated-training-data.js,
  // nutrition-app.js v1); missing live scripts added (update-notifier.js,
  // global-preload-bar.js, nutrition-app-v2.js) so pages work offline.
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/workout.js',
  './js/session-cache.js',
  './js/offline-preloader.js',
  './js/data-preloader.js',
  './js/preload-modal.js',
  './js/update-notifier.js',
  './js/version.js',
  './js/global-preload-bar.js',
  './viewport.js',

  // JavaScript - Features
  './js/workout-history.js',
  './js/profile-manager.js',
  './js/pace-zones.js',
  './js/questionnaire-banner.js',
  './js/nutrition-app-v2.js',
  './js/nutrition-engine.js',
  './js/training-selector.js',

  // CSS — versioned URLs must match the HTML links EXACTLY (Cache API is
  // query-sensitive). Bump ?v= here AND in every page on each CSS change.
  './css/design-system.css?v=20260818w1',
  './css/main.css?v=20260818w9',
  './css/nutrition.css?v=20260818w4',
  
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
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap',
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
  console.log('[Service Worker] Installing v8.2.71...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell v8.2.71');
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
        // NO skipWaiting() here — the new worker WAITS until the user taps
        // "Aggiorna" (update-notifier.js posts SKIP_WAITING, handled below).
        //
        // The V9 rollout temporarily forced activation from install. Leaving it
        // in made every release a broken loop: the banner appeared asking for
        // consent while the worker activated itself anyway, controllerchange
        // fired, and the notifier force-reloaded the page seconds later — the
        // "new version keeps appearing" complaint. Consent flow restored
        // 2026-08-10 (V9 settled twelve forced releases ago).
        console.log('[Service Worker] Install complete - waiting for user consent');
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
    // 1. Preload Images — CONCURRENT pool (was one-at-a-time, painfully slow for
    //    ~1-3 MB GIFs). A fixed pool of workers drains a shared index so N images
    //    download in parallel without flooding the connection.
    const IMG_CONCURRENCY = 6;
    let imgCursor = 0;
    let imgDone = 0;

    const imageWorker = async () => {
      while (true) {
        if (preloadAborted) return;
        const i = imgCursor++;
        if (i >= imageUrls.length) return;
        const url = imageUrls[i];

        try {
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

        imgDone++;
        // Broadcast progress every 5 completions
        if (imgDone % 5 === 0 || imgDone === imageUrls.length) {
          broadcastProgress('images', imgDone, imageUrls.length);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(IMG_CONCURRENCY, imageUrls.length || 1) }, imageWorker)
    );
    if (preloadAborted) console.log('[Service Worker] Preload aborted');

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
  console.log('[Service Worker] Activating v8.2.71...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Keep current caches, preload cache, and the permanent audio + GIF caches
          // (both unversioned - purging them would re-download every clip and GIF
          // on every release).
          if (cacheName !== CACHE_NAME &&
              cacheName !== RUNTIME_CACHE &&
              cacheName !== PRELOAD_CACHE &&
              cacheName !== AUDIO_CACHE &&
              cacheName !== GIF_CACHE) {
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

  // v10.1 iOS: gli <audio>/<video> WebKit fanno richieste con header Range e si
  // aspettano un 206. Un match di cache che torna 200 pieno puo' stallare il
  // media. Per le richieste Range su media: servi una 206 sintetica dalla cache
  // se possibile, altrimenti lascia passare alla rete.
  if (request.headers.has('range') && request.destination !== 'document') {
    event.respondWith((async () => {
      const cached = await caches.match(request.url, { ignoreSearch: false });
      if (!cached) {
        try { return await fetch(request); }
        catch (e) { return new Response('Offline', { status: 503 }); }
      }
      try {
        const buf = await cached.arrayBuffer();
        const m = /bytes=(\d+)-(\d*)/.exec(request.headers.get('range') || '');
        const start = m ? parseInt(m[1], 10) : 0;
        const end = (m && m[2]) ? Math.min(parseInt(m[2], 10), buf.byteLength - 1) : buf.byteLength - 1;
        return new Response(buf.slice(start, end + 1), {
          status: 206,
          headers: {
            'Content-Type': cached.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
          },
        });
      } catch (e) {
        return cached;
      }
    })());
    return;
  }

  // Handle external CDN domains
  if (url.origin !== self.location.origin) {
    // Instructor voice clips (endurance): cache-first, permanent AUDIO_CACHE.
    // Kept out of the versioned caches so a version bump doesn't force an ~80-file
    // re-download. Must be raw.githubusercontent.com — github.com/.../raw/ 302s and
    // the Cache API refuses redirected responses.
    if (url.origin.includes('raw.githubusercontent.com') &&
        url.pathname.includes('viltrum-audio-istruttore')) {
      event.respondWith(
        caches.open(AUDIO_CACHE).then(cache =>
          cache.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            }).catch(() => new Response('Offline', { status: 503 }));
          })
        )
      );
      return;
    }

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