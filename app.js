// --- CONFIGURATION SUPABASE & ID DE PROJET ---
const SUPABASE_URL = 'https://sglpkosiijcftoiqlcyg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3Rnvf81P39qJ_IepYWzvhQ_HZR9WL66';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Gestionnaire d'utilisateur anonyme unique
function getDeviceId() {
    let devId = localStorage.getItem('bushub_user_id');
    if (!devId) {
        devId = 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
        localStorage.setItem('bushub_user_id', devId);
    }
    return devId;
}

const MY_USER_ID = getDeviceId();

const AppState = {
    posts: [],
    filter: 'all' // 'all', 'photo', 'video'
};

const DOM = {
    todayBadge: document.getElementById('today-badge'),
    feedContainer: document.getElementById('feed-container'),
    cameraInput: document.getElementById('camera-input'),
    filterAll: document.getElementById('filter-all'),
    filterPhoto: document.getElementById('filter-photo'),
    filterVideo: document.getElementById('filter-video'),
    reloadBtn: document.getElementById('reload-btn'),
    reloadIcon: document.getElementById('reload-icon'),
    networkBanner: document.getElementById('network-banner')
};

let timerInterval = null;

function getStartOfTodayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

function formatTodayBadge() {
    const now = new Date();
    const options = { day: 'numeric', month: 'short' };
    DOM.todayBadge.textContent = `Aujourd'hui - ${now.toLocaleDateString('fr-FR', options)}`;
}

async function init() {
    formatTodayBadge();
    setupEventListeners();
    updateOnlineStatus();

    // Récupération depuis la mise en cache locale d'abord (Affichage ultra rapide)
    loadLocalCache();

    // Ensuite synchronisation réseau
    await fetchTodayPostsAndSubscribe();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateAllTimers, 1000);
}

// --- GESTION DES RÉACTIONS RAPIDES ---
async function handleReactionClick(postId, emoji) {
    const post = AppState.posts.find(p => p.id === postId);
    if (!post) return;

    // structure reactions = { "🔥": ["usr_1", "usr_2"], "👍": ["usr_3"] }
    let reactions = post.reactions || {};
    
    // Si c'est l'ancien format d'objet numéroté, conversion automatique
    Object.keys(reactions).forEach(k => {
        if (typeof reactions[k] === 'number') reactions[k] = [];
    });

    if (!Array.isArray(reactions[emoji])) {
        reactions[emoji] = [];
    }

    const userIndex = reactions[emoji].indexOf(MY_USER_ID);

    if (userIndex > -1) {
        // Retirer la réaction si l'utilisateur réappuie
        reactions[emoji].splice(userIndex, 1);
    } else {
        // Ajouter l'utilisateur à l'emoji
        reactions[emoji].push(MY_USER_ID);
    }

    // Mise à jour locale immédiate (Optimistic UI)
    post.reactions = { ...reactions };
    saveToLocalCache();
    renderPosts();

    // Synchronisation Supabase en tâche de fond
    if (navigator.onLine) {
        const { error } = await sbClient
            .from('posts')
            .update({ reactions: post.reactions })
            .eq('id', postId);

        if (error) console.error("Erreur mise à jour réaction:", error);
    }
}

// --- COMPTE À REBOURS DE DISPARITION (24H) ---
function getTimeRemaining(createdAt) {
    const createdTime = new Date(createdAt).getTime();
    const expireTime = createdTime + (24 * 60 * 60 * 1000);
    const now = Date.now();
    const diff = expireTime - now;

    if (diff <= 0) return "Expiré";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours}h ${minutes}m ${seconds}s`;
}

function updateAllTimers() {
    document.querySelectorAll('[data-expiry-id]').forEach(el => {
        const postId = el.getAttribute('data-expiry-id');
        const post = AppState.posts.find(p => p.id === postId);
        if (post) {
            const timeLeft = getTimeRemaining(post.created_at);
            el.textContent = `⏱️ Expire dans ${timeLeft}`;
        }
    });
}

// --- GESTION DU CACHE LOCAL (SANS RÉSEAU) ---
function saveToLocalCache() {
    try {
        localStorage.setItem('bushub_posts_cache', JSON.stringify(AppState.posts));
    } catch (e) {
        console.warn("Stockage local saturé:", e);
    }
}

function loadLocalCache() {
    const cached = localStorage.getItem('bushub_posts_cache');
    if (cached) {
        try {
            AppState.posts = JSON.parse(cached);
            renderPosts();
        } catch (e) {
            console.error("Erreur lecture cache:", e);
        }
    }
}

// --- RELOAD ET ETAT DU RÉSEAU ---
function updateOnlineStatus() {
    if (navigator.onLine) {
        DOM.networkBanner.classList.add('hidden');
    } else {
        DOM.networkBanner.classList.remove('hidden');
    }
}

async function forceNetworkReload() {
    if (!navigator.onLine) {
        alert("Réseau indisponible. Utilisation de la version en cache.");
        return;
    }

    DOM.reloadIcon.classList.add('animate-spin');

    try {
        sbClient.removeAllChannels();
        await fetchTodayPostsAndSubscribe();
    } catch (err) {
        console.error("Erreur de rechargement:", err);
    } finally {
        setTimeout(() => DOM.reloadIcon.classList.remove('animate-spin'), 400);
    }
}

// --- COMPRESSION COMPACTE DES IMAGES ---
function fileToBase64(file) {
    return new Promise((resolve) => {
        if (file.type.startsWith('video')) {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 800;

                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.55));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

// --- PUBLICATION EN DIRECT ET ENVOI ---
async function uploadMedia(file) {
    const isVideo = file.type.startsWith('video');
    const mediaType = isVideo ? 'video' : 'image';
    const base64Data = await fileToBase64(file);
    const postId = 'post_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const newPost = {
        id: postId,
        media_type: mediaType,
        media_data: base64Data,
        reactions: {},
        created_at: new Date().toISOString()
    };

    // Affichage instantané en local
    AppState.posts.unshift(newPost);
    saveToLocalCache();
    renderPosts();

    if (!navigator.onLine) {
        alert("Enregistré localement. La publication se fera au retour du réseau.");
        return;
    }

    const { error } = await sbClient
        .from('posts')
        .insert([newPost]);

    if (error) {
        alert("L'image est trop lourde pour la connexion actuelle.");
    }
}

// --- SYNC TEMPS RÉEL SUPABASE ---
async function fetchTodayPostsAndSubscribe() {
    const startOfDay = getStartOfTodayISO();

    const { data: posts, error } = await sbClient
        .from('posts')
        .select('*')
        .gte('created_at', startOfDay)
        .order('created_at', { ascending: false });

    if (!error && posts) {
        AppState.posts = posts;
        saveToLocalCache();
        renderPosts();
    }

    sbClient
        .channel('public_feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, payload => {
            if (payload.eventType === 'INSERT') {
                const newPost = payload.new;
                if (!AppState.posts.some(p => p.id === newPost.id)) {
                    AppState.posts.unshift(newPost);
                    saveToLocalCache();
                    renderPosts();
                }
            } else if (payload.eventType === 'UPDATE') {
                const updatedPost = payload.new;
                const idx = AppState.posts.findIndex(p => p.id === updatedPost.id);
                if (idx !== -1) {
                    AppState.posts[idx] = updatedPost;
                    saveToLocalCache();
                    renderPosts();
                }
            }
        })
        .subscribe();
}

// --- RENDU DÉTAILLÉ DU FLUX ---
function renderPosts() {
    DOM.feedContainer.innerHTML = '';

    const filteredPosts = AppState.posts.filter(post => {
        if (AppState.filter === 'photo') return post.media_type === 'image';
        if (AppState.filter === 'video') return post.media_type === 'video';
        return true;
    });

    if (filteredPosts.length === 0) {
        DOM.feedContainer.innerHTML = `
            <div class="text-center py-20 text-slate-500">
                <p class="text-xs uppercase font-mono tracking-wider">Aucun média publié</p>
                <p class="text-xs mt-1 text-slate-600">Prenez une photo pour démarrer le flux.</p>
            </div>
        `;
        return;
    }

    filteredPosts.forEach(post => {
        const card = document.createElement('div');
        card.className = "post-card bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg space-y-2";

        const mediaHtml = post.media_type === 'video'
            ? `<video src="${post.media_data}" controls class="w-full max-h-[70vh] object-contain bg-black" preload="metadata"></video>`
            : `<img src="${post.media_data}" class="w-full max-h-[70vh] object-contain bg-black" loading="lazy">`;

        const time = new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const ext = post.media_type === 'video' ? 'mp4' : 'jpg';
        const fileName = `bushub_${post.id}.${ext}`;

        // Calcul des personnes uniques et réagissant
        const reactions = post.reactions || {};
        const availableEmojis = ['🔥', '🚌', '👍', '❤️', '😮'];
        
        const uniqueUsers = new Set();
        Object.values(reactions).forEach(arr => {
            if (Array.isArray(arr)) arr.forEach(u => uniqueUsers.add(u));
        });
        const totalPeopleCount = uniqueUsers.size;

        let emojiButtonsHtml = availableEmojis.map(emoji => {
            const userArray = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
            const count = userArray.length;
            const hasUserReacted = userArray.includes(MY_USER_ID);

            return `
                <button 
                    data-action="react" 
                    data-post-id="${post.id}" 
                    data-emoji="${emoji}"
                    class="emoji-btn px-2.5 py-1 rounded-xl text-xs flex items-center space-x-1.5 transition border ${
                        hasUserReacted 
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold' 
                            : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-700/50'
                    }">
                    <span>${emoji}</span>
                    ${count > 0 ? `<span class="text-[11px] font-mono">${count}</span>` : ''}
                </button>
            `;
        }).join('');

        card.innerHTML = `
            ${mediaHtml}
            
            <!-- Informations & Timer 24h -->
            <div class="px-3 pt-2 flex justify-between items-center text-[11px] font-mono text-slate-400">
                <span class="flex items-center space-x-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>${time}</span>
                </span>
                <span data-expiry-id="${post.id}" class="text-amber-400 font-semibold">
                    ⏱️ Expire dans ${getTimeRemaining(post.created_at)}
                </span>
            </div>

            <!-- Barre de Réactions Rapides -->
            <div class="px-3 py-1 flex items-center justify-between border-t border-slate-800/80 pt-2">
                <div class="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
                    ${emojiButtonsHtml}
                </div>
                <div class="text-[10px] font-mono text-slate-400 shrink-0 ml-2 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700/50">
                    👥 <span>${totalPeopleCount} ${totalPeopleCount > 1 ? 'personnes' : 'personne'}</span>
                </div>
            </div>

            <!-- Téléchargement Direct -->
            <div class="p-3 border-t border-slate-800/80 flex justify-between items-center text-[11px] font-mono text-slate-400">
                <span>${post.media_type === 'video' ? 'Vidéo' : 'Photo'}</span>
                <a href="${post.media_data}" download="${fileName}" class="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:text-white active:scale-95 transition flex items-center space-x-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                    <span>Télécharger</span>
                </a>
            </div>
        `;
        DOM.feedContainer.appendChild(card);
    });
}

// --- ÉVÉNEMENTS & DÉLÉGATION ---
function setupEventListeners() {
    if (DOM.reloadBtn) DOM.reloadBtn.addEventListener('click', forceNetworkReload);

    // Délégation globale d'événements pour les boutons de réactions
    DOM.feedContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="react"]');
        if (btn) {
            const postId = btn.getAttribute('data-post-id');
            const emoji = btn.getAttribute('data-emoji');
            handleReactionClick(postId, emoji);
        }
    });

    const buttons = [
        { el: DOM.filterAll, type: 'all' },
        { el: DOM.filterPhoto, type: 'photo' },
        { el: DOM.filterVideo, type: 'video' }
    ];

    buttons.forEach(({ el, type }) => {
        if (el) {
            el.addEventListener('click', () => {
                AppState.filter = type;
                buttons.forEach(b => {
                    if (b.el) b.el.className = "flex-1 py-1.5 rounded-lg font-medium transition text-slate-400 hover:text-white";
                });
                el.className = "flex-1 py-1.5 rounded-lg font-medium transition text-black bg-emerald-400";
                renderPosts();
            });
        }
    });

    if (DOM.cameraInput) {
        DOM.cameraInput.addEventListener('change', (e) => {
            if (e.target.files[0]) uploadMedia(e.target.files[0]);
        });
    }

    window.addEventListener('online', () => {
        updateOnlineStatus();
        fetchTodayPostsAndSubscribe();
    });
    window.addEventListener('offline', updateOnlineStatus);
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => reg.update());
}

document.addEventListener('DOMContentLoaded', init);