const CACHE_NAME = 'bushub-live-v2';

// Installation : prend le contrôle immédiatement
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

// Activation : nettoie les anciens caches de la PWA
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Stratégie "Network First" : Essaie toujours le réseau en premier pour le temps réel
self.addEventListener('fetch', (e) => {
    // Les requêtes vers Supabase ou les WebSockets doivent TOUJOURS être en direct
    if (e.request.url.includes('supabase.co')) {
        return;
    }

    e.respondWith(
        fetch(e.request)
            .then((networkResponse) => {
                // Met à jour le cache avec le fichier frais du réseau
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Si l'utilisateur est hors-ligne, utilise la version en cache
                return caches.match(e.request);
            })
    );
});