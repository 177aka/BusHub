// ⚠️ Remplace TON_ID_PROJET par le vrai ID de ton projet Supabase
const SUPABASE_URL = 'https://sglpkosiijcftoiqlcyg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3Rnvf81P39qJ_IepYWzvhQ_HZR9WL66';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
    filterVideo: document.getElementById('filter-video')
};

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
    await fetchTodayPostsAndSubscribe();
}

// 1. Enregistrement du Service Worker avec vérification de mise à jour
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
        // Forcer la recherche de mise à jour du SW à chaque ouverture
        reg.update();
    });
}

// 2. Détecter quand l'application revient au premier plan (quand on clique sur l'icône PWA)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Rafraîchit automatiquement le flux du jour en direct
        if (typeof fetchTodayPostsAndSubscribe === 'function') {
            fetchTodayPostsAndSubscribe();
        }
    }
});

// --- COMPRESSION COMPACTE ---
function fileToBase64(file) {
    return new Promise((resolve) => {
        if (file.type.startsWith('video')) {
            // Limite la taille des vidéos pour ne pas saturer la requête
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        } else {
            // Compression dynamique de l'image
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 800; // Taille optimale mobile

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

                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

// --- PUBLICATION EN DIRECT ---
async function uploadMedia(file) {
    const isVideo = file.type.startsWith('video');
    const mediaType = isVideo ? 'video' : 'image';
    const base64Data = await fileToBase64(file);
    const postId = 'post_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const { error } = await sbClient
        .from('posts')
        .insert([{
            id: postId,
            media_type: mediaType,
            media_data: base64Data,
            created_at: new Date().toISOString()
        }]);

    if (error) {
        alert("Erreur lors de la publication. Le fichier est peut-être trop lourd.");
    }
}

// --- RÉCUPÉRATION DU FLUX EN TEMPS RÉEL ---
async function fetchTodayPostsAndSubscribe() {
    const startOfDay = getStartOfTodayISO();

    // 1. Chargement des posts créés depuis minuit
    const { data: posts, error } = await sbClient
        .from('posts')
        .select('*')
        .gte('created_at', startOfDay)
        .order('created_at', { ascending: false });

    if (!error && posts) {
        AppState.posts = posts;
        renderPosts();
    }

    // 2. Écoute instantanée des nouveaux messages créés
    sbClient
        .channel('public_feed')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'posts' 
        }, payload => {
            const newPost = payload.new;
            if (new Date(newPost.created_at) >= new Date(startOfDay)) {
                if (!AppState.posts.some(p => p.id === newPost.id)) {
                    AppState.posts.unshift(newPost);
                    renderPosts();
                }
            }
        })
        .subscribe();
}

// --- AFFICHAGE DU FLUX ---
function renderPosts() {
    DOM.feedContainer.innerHTML = '';

    const filteredPosts = AppState.posts.filter(post => {
        if (AppState.filter === 'photo') return post.media_type === 'image';
        if (AppState.filter === 'video') return post.media_type === 'video';
        return true;
    });

    if (filteredPosts.length === 0) {
        DOM.feedContainer.innerHTML = `
            <div class="text-center py-20 text-[var(--text-muted)]">
                <p class="text-xs uppercase font-mono tracking-wider">Aucun média publié</p>
                <p class="text-xs mt-1">Prenez une photo ou vidéo pour ouvrir le flux du jour.</p>
            </div>
        `;
        return;
    }

    filteredPosts.forEach(post => {
        const card = document.createElement('div');
        card.className = "border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-2xl overflow-hidden shadow-sm";

        const mediaHtml = post.media_type === 'video'
            ? `<video src="${post.media_data}" controls class="w-full max-h-[70vh] object-contain bg-black"></video>`
            : `<img src="${post.media_data}" class="w-full max-h-[70vh] object-contain bg-black" loading="lazy">`;

        const time = new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        card.innerHTML = `
            ${mediaHtml}
            <div class="p-3 border-t border-[var(--border-color)] flex justify-between items-center text-[11px] font-mono text-[var(--text-muted)]">
                <span class="flex items-center space-x-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>${post.media_type === 'video' ? 'Vidéo' : 'Photo'} en direct</span>
                </span>
                <span>Publié à ${time}</span>
            </div>
        `;
        DOM.feedContainer.appendChild(card);
    });
}

// --- GESTION DES ÉVÉNEMENTS ---
function setupEventListeners() {
    // Changement de filtre
    const buttons = [
        { el: DOM.filterAll, type: 'all' },
        { el: DOM.filterPhoto, type: 'photo' },
        { el: DOM.filterVideo, type: 'video' }
    ];

    buttons.forEach(({ el, type }) => {
        el.addEventListener('click', () => {
            AppState.filter = type;
            buttons.forEach(b => {
                b.el.className = "filter-btn px-3 py-1 rounded-lg text-xs font-medium transition text-[var(--text-muted)]";
            });
            el.className = "filter-btn px-3 py-1 rounded-lg text-xs font-medium bg-[var(--accent)] text-black transition";
            renderPosts();
        });
    });

    // Capture média
    DOM.cameraInput.addEventListener('change', (e) => {
        if (e.target.files[0]) uploadMedia(e.target.files[0]);
    });
}

document.addEventListener('DOMContentLoaded', init);