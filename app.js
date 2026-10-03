// ⚠️ Remplace TON_ID_PROJET par le vrai ID de ton projet Supabase
const SUPABASE_URL = 'https://sglpkosiijcftoiqlcyg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3Rnvf81P39qJ_IepYWzvhQ_HZR9WL66';

// Initialisation unique du client Supabase
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const AppState = {
    currentGroup: JSON.parse(localStorage.getItem('bushub_group')) || null,
    posts: [],
    theme: localStorage.getItem('bushub_theme') || 'dark',
    activeObjectUrls: []
};

const DOM = {
    groupTitle: document.getElementById('group-title'),
    groupMembersCount: document.getElementById('group-members-count'),
    todayBadge: document.getElementById('today-badge'),
    feedContainer: document.getElementById('feed-container'),
    cameraInput: document.getElementById('camera-input'),
    modalGroups: document.getElementById('modal-groups'),
    modalSettings: document.getElementById('modal-settings'),
    btnGroupMenu: document.getElementById('btn-group-menu'),
    btnSettings: document.getElementById('btn-settings'),
    btnCloseGroups: document.getElementById('close-modal-groups'),
    btnCloseSettings: document.getElementById('close-modal-settings'),
    btnJoin: document.getElementById('btn-join'),
    btnCreate: document.getElementById('btn-create'),
    joinCodeInput: document.getElementById('join-code-input'),
    createNameInput: document.getElementById('create-name-input')
};

// --- INDEXEDDB (Stockage local sur le téléphone) ---
const DB_NAME = 'BusHubDB';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('media')) {
                db.createObjectStore('media', { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveMediaLocally(id, blob, dateStr) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('media', 'readwrite');
        tx.objectStore('media').put({ id, blob, dateStr });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getLocalMedia(id) {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction('media', 'readonly');
        const req = tx.objectStore('media').get(id);
        req.onsuccess = () => resolve(req.result ? req.result.blob : null);
        req.onerror = () => resolve(null);
    });
}

async function cleanOldLocalMedia() {
    const today = getTodayDateStr();
    const db = await openDB();
    const tx = db.transaction('media', 'readwrite');
    const store = tx.objectStore('media');
    const req = store.openCursor();
    
    req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            if (cursor.value.dateStr !== today) store.delete(cursor.key);
            cursor.continue();
        }
    };
}

function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
}

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
    setTheme(AppState.theme);
    formatTodayBadge();
    setupEventListeners();
    await cleanOldLocalMedia();
    updateUI();

    if (AppState.currentGroup) {
        fetchTodayPostsAndSubscribe();
    }
}

function setTheme(theme) {
    AppState.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bushub_theme', theme);
}

function updateUI() {
    if (AppState.currentGroup) {
        DOM.groupTitle.textContent = AppState.currentGroup.name;
        DOM.groupMembersCount.textContent = `Code: ${AppState.currentGroup.code} • ${AppState.currentGroup.members}/200 membres`;
    } else {
        DOM.groupTitle.textContent = "Aucun groupe";
        DOM.groupMembersCount.textContent = "0 / 200 membres";
    }
}

function revokeActiveUrls() {
    AppState.activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
    AppState.activeObjectUrls = [];
}

function generateCode() {
    return 'BH-' + Math.floor(1000 + Math.random() * 9000);
}

async function createGroup(name) {
    const code = generateCode();
    const { data, error } = await sbClient
        .from('groups')
        .insert([{ name, code, members: 1 }])
        .select()
        .single();

    if (error) return alert("Erreur lors de la création du groupe.");

    AppState.currentGroup = data;
    localStorage.setItem('bushub_group', JSON.stringify(data));
    updateUI();
    fetchTodayPostsAndSubscribe();
}

async function joinGroup(code) {
    const { data: group, error } = await sbClient
        .from('groups')
        .select('*')
        .eq('code', code)
        .single();

    if (error || !group) return alert("Code introuvable !");
    if (group.members >= 200) return alert("Groupe complet (200 membres max).");

    const newMemberCount = group.members + 1;
    await sbClient.from('groups').update({ members: newMemberCount }).eq('id', group.id);

    group.members = newMemberCount;
    AppState.currentGroup = group;
    localStorage.setItem('bushub_group', JSON.stringify(group));
    updateUI();
    fetchTodayPostsAndSubscribe();
}

function compressImage(file) {
    return new Promise((resolve) => {
        if (file.type.startsWith('video')) return resolve(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1280;

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

                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function uploadMedia(rawFile) {
    if (!AppState.currentGroup) return;

    const compressedBlob = await compressImage(rawFile);
    const isVideo = rawFile.type.startsWith('video');
    const postId = 'post_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const today = getTodayDateStr();

    await saveMediaLocally(postId, compressedBlob, today);

    const { error } = await sbClient
        .from('posts')
        .insert([{
            id: postId,
            group_id: AppState.currentGroup.id,
            created_at: new Date().toISOString(),
            is_video: isVideo
        }]);

    if (error) return alert("Erreur de publication.");

    const reader = new FileReader();
    reader.onload = () => {
        sbClient.channel(`group_${AppState.currentGroup.id}`).send({
            type: 'broadcast',
            event: 'new_media_blob',
            payload: {
                id: postId,
                blobData: reader.result,
                isVideo,
                createdAt: new Date().toISOString()
            }
        });
    };
    reader.readAsDataURL(compressedBlob);

    fetchTodayPostsAndSubscribe();
}

async function fetchTodayPostsAndSubscribe() {
    if (!AppState.currentGroup) return;

    revokeActiveUrls();
    const startOfDay = getStartOfTodayISO();

    const { data: posts, error } = await sbClient
        .from('posts')
        .select('*')
        .eq('group_id', AppState.currentGroup.id)
        .gte('created_at', startOfDay)
        .order('created_at', { ascending: false });

    if (!error && posts) {
        AppState.posts = posts;
        await renderPosts();
    }

    const channel = sbClient.channel(`group_${AppState.currentGroup.id}`);

    channel
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'posts', 
            filter: `group_id=eq.${AppState.currentGroup.id}` 
        }, payload => {
            const newPost = payload.new;
            if (new Date(newPost.created_at) >= new Date(startOfDay)) {
                if (!AppState.posts.some(p => p.id === newPost.id)) {
                    AppState.posts.unshift(newPost);
                    renderPosts();
                }
            }
        })
        .on('broadcast', { event: 'new_media_blob' }, async ({ payload }) => {
            if (payload && payload.id) {
                const res = await fetch(payload.blobData);
                const blob = await res.blob();
                await saveMediaLocally(payload.id, blob, getTodayDateStr());
                renderPosts();
            }
        })
        .subscribe();
}

async function renderPosts() {
    revokeActiveUrls();
    DOM.feedContainer.innerHTML = '';

    if (AppState.posts.length === 0) {
        DOM.feedContainer.innerHTML = `
            <div class="text-center py-20 text-[var(--text-muted)]">
                <p class="text-xs uppercase font-mono tracking-wider">Aucun média aujourd'hui</p>
                <p class="text-xs mt-1">Prenez une photo pour informer le groupe.</p>
            </div>
        `;
        return;
    }

    for (const post of AppState.posts) {
        const card = document.createElement('div');
        card.className = "border border-[var(--border-color)] bg-[var(--bg-surface)] rounded-2xl overflow-hidden shadow-sm";

        const blob = await getLocalMedia(post.id);
        let mediaHtml = '';

        if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            AppState.activeObjectUrls.push(objectUrl);

            mediaHtml = post.is_video 
                ? `<video src="${objectUrl}" controls class="w-full max-h-[70vh] object-contain bg-black"></video>`
                : `<img src="${objectUrl}" class="w-full max-h-[70vh] object-contain bg-black">`;
        } else {
            mediaHtml = `
                <div class="h-48 bg-[var(--bg-element)] flex items-center justify-center text-[var(--text-muted)] text-xs font-mono p-4 text-center">
                    Média en cours de synchronisation...
                </div>
            `;
        }

        const time = new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        card.innerHTML = `
            ${mediaHtml}
            <div class="p-3 border-t border-[var(--border-color)] flex justify-between items-center text-[11px] font-mono text-[var(--text-muted)]">
                <span class="flex items-center space-x-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>En direct</span>
                </span>
                <span>${time}</span>
            </div>
        `;
        DOM.feedContainer.appendChild(card);
    }
}

function setupEventListeners() {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => setTheme(btn.getAttribute('data-theme')));
    });

    DOM.btnGroupMenu.addEventListener('click', () => DOM.modalGroups.classList.remove('hidden'));
    DOM.btnCloseGroups.addEventListener('click', () => DOM.modalGroups.classList.add('hidden'));
    DOM.btnSettings.addEventListener('click', () => DOM.modalSettings.classList.remove('hidden'));
    DOM.btnCloseSettings.addEventListener('click', () => DOM.modalSettings.classList.add('hidden'));

    DOM.btnCreate.addEventListener('click', () => {
        const name = DOM.createNameInput.value.trim();
        if (name) {
            createGroup(name);
            DOM.createNameInput.value = '';
            DOM.modalGroups.classList.add('hidden');
        }
    });

    DOM.btnJoin.addEventListener('click', () => {
        const code = DOM.joinCodeInput.value.trim().toUpperCase();
        if (code) {
            joinGroup(code);
            DOM.joinCodeInput.value = '';
            DOM.modalGroups.classList.add('hidden');
        }
    });

    DOM.cameraInput.addEventListener('change', (e) => {
        if (!AppState.currentGroup) {
            alert("Rejoignez d'abord un groupe.");
            return DOM.modalGroups.classList.remove('hidden');
        }
        if (e.target.files[0]) uploadMedia(e.target.files[0]);
    });
}

document.addEventListener('DOMContentLoaded', init);