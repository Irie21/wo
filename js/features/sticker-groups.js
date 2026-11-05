/* 聊天表情包：最近使用 + 分组 */

const STICKER_RECENT_KEY = 'stickerRecentV1';
const STICKER_RECENT_LIMIT = 24;
let _stickerRecent = null;
const _stickerFpCache = {
    my: { ref: null, len: -1, map: null },
    partner: { ref: null, len: -1, map: null }
};

function stickerLibraryFor(libKey) {
    return libKey === 'my'
        ? (typeof myStickerLibrary !== 'undefined' ? myStickerLibrary : [])
        : (typeof stickerLibrary !== 'undefined' ? stickerLibrary : []);
}

function stickerGroupsFor(libKey) {
    if (libKey === 'my') {
        if (!Array.isArray(myStickerGroups)) myStickerGroups = [];
        return myStickerGroups;
    }
    if (!Array.isArray(partnerStickerGroups)) partnerStickerGroups = [];
    return partnerStickerGroups;
}

function stickerFingerprint(src) {
    const s = String(src || '');
    const len = s.length;
    if (!len) return '';
    let h1 = 2166136261 >>> 0;
    let h2 = 0;
    const step = Math.max(1, Math.floor(len / 320));
    for (let i = 0; i < len; i += step) {
        const c = s.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 16777619) >>> 0;
        h2 = (Math.imul(h2, 31) + c) >>> 0;
    }
    const last = s.charCodeAt(len - 1) || 0;
    h2 = (Math.imul(h2, 31) + last) >>> 0;
    return len.toString(36) + '-' + h1.toString(36) + '-' + h2.toString(36);
}

function getStickerFpMap(libKey) {
    const lib = stickerLibraryFor(libKey);
    const cache = _stickerFpCache[libKey];
    if (cache.ref !== lib || cache.len !== lib.length) {
        const map = new Map();
        lib.forEach(src => map.set(stickerFingerprint(src), src));
        cache.ref = lib;
        cache.len = lib.length;
        cache.map = map;
    }
    return cache.map;
}

function loadStickerRecent() {
    if (_stickerRecent) return _stickerRecent;
    _stickerRecent = [];
    try {
        const raw = localStorage.getItem(STICKER_RECENT_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr)) {
            _stickerRecent = arr.filter(x => x && typeof x.fp === 'string' && (x.lib === 'my' || x.lib === 'partner')).slice(0, STICKER_RECENT_LIMIT);
        }
    } catch (e) {}
    return _stickerRecent;
}

function saveStickerRecent() {
    try {
        localStorage.setItem(STICKER_RECENT_KEY, JSON.stringify((_stickerRecent || []).slice(0, STICKER_RECENT_LIMIT)));
    } catch (e) {}
}

function recordStickerRecent(libKey, src) {
    try {
        if (!src) return;
        loadStickerRecent();
        const fp = stickerFingerprint(src);
        _stickerRecent = _stickerRecent.filter(x => !(x.lib === libKey && x.fp === fp));
        _stickerRecent.unshift({ fp, lib: libKey, ts: Date.now() });
        _stickerRecent = _stickerRecent.slice(0, STICKER_RECENT_LIMIT);
        saveStickerRecent();
    } catch (e) {}
}

function getRecentStickers(limit = 12) {
    loadStickerRecent();
    const out = [];
    const seen = new Set();
    for (const item of _stickerRecent) {
        const map = getStickerFpMap(item.lib);
        const src = map.get(item.fp);
        if (!src || seen.has(src)) continue;
        seen.add(src);
        out.push({ src, lib: item.lib });
        if (out.length >= limit) break;
    }
    return out;
}

function clearStickerRecent() {
    _stickerRecent = [];
    saveStickerRecent();
    if (typeof window.refreshStickerPicker === 'function') window.refreshStickerPicker();
}

function _stickerOverlay() {
    if (typeof _makeOverlay === 'function') return _makeOverlay();
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:20px;';
    return overlay;
}

function _openStickerGroupManagerFor(libKey) {
    const groups = stickerGroupsFor(libKey);
    const lib = stickerLibraryFor(libKey);
    const valid = new Set(lib.map(stickerFingerprint));
    let changed = false;
    groups.forEach(group => {
        if (Array.isArray(group.items)) {
            const filtered = group.items.filter(fp => valid.has(fp));
            if (filtered.length !== group.items.length) {
                group.items = filtered;
                changed = true;
            }
        }
    });
    if (changed && typeof throttledSaveData === 'function') throttledSaveData();

    const ctx = {
        groups,
        items: lib.map(stickerFingerprint),
        itemLabel: libKey === 'my' ? '我的表情' : '表情',
        showToggle: false,
        onChange: () => {
            if (typeof window.refreshStickerPicker === 'function') window.refreshStickerPicker();
        }
    };

    if (typeof _showGroupManager === 'function') {
        _showGroupManager(ctx);
    } else {
        showNotification('分组管理组件未加载', 'error');
    }
}

function openStickerGroupManager(libKey) {
    if (libKey === 'my' || libKey === 'partner') {
        _openStickerGroupManagerFor(libKey);
        return;
    }

    const overlay = _stickerOverlay();
    const panel = document.createElement('div');
    panel.style.cssText = `
        background:var(--secondary-bg);border-radius:22px;padding:22px;
        width:92%;max-width:360px;
        box-shadow:0 24px 80px rgba(0,0,0,.45);
        animation:popIn 0.22s cubic-bezier(.34,1.56,.64,1);
    `;
    panel.innerHTML = `
        <style>@keyframes popIn{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}</style>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div style="font-size:16px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
                <i class="fas fa-layer-group" style="color:var(--accent-color);"></i>表情包分组
            </div>
            <button id="sgm-close" style="width:30px;height:30px;border-radius:50%;border:none;background:var(--primary-bg);color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px;">
            <button id="sgm-my" style="display:flex;align-items:center;gap:11px;width:100%;padding:14px;border-radius:14px;border:1.5px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);font-size:14px;font-family:var(--font-family);cursor:pointer;text-align:left;">
                <span style="width:34px;height:34px;border-radius:10px;background:rgba(var(--accent-color-rgb),0.12);color:var(--accent-color);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-user"></i></span>
                <span style="flex:1;">我的表情</span>
                <span style="font-size:11px;color:var(--text-secondary);">${stickerGroupsFor('my').length} 个分组</span>
            </button>
            <button id="sgm-partner" style="display:flex;align-items:center;gap:11px;width:100%;padding:14px;border-radius:14px;border:1.5px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);font-size:14px;font-family:var(--font-family);cursor:pointer;text-align:left;">
                <span style="width:34px;height:34px;border-radius:10px;background:rgba(var(--accent-color-rgb),0.12);color:var(--accent-color);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-heart"></i></span>
                <span style="flex:1;">对方表情</span>
                <span style="font-size:11px;color:var(--text-secondary);">${stickerGroupsFor('partner').length} 个分组</span>
            </button>
        </div>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    panel.querySelector('#sgm-close').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    panel.querySelector('#sgm-my').onclick = () => { close(); _openStickerGroupManagerFor('my'); };
    panel.querySelector('#sgm-partner').onclick = () => { close(); _openStickerGroupManagerFor('partner'); };
}

function initStickerGroups() {
    loadStickerRecent();
    const entry = document.getElementById('sticker-groups-function');
    if (entry && !entry.dataset.stickerGroupsBound) {
        entry.dataset.stickerGroupsBound = 'true';
        entry.addEventListener('click', () => {
            const advanced = document.getElementById('advanced-modal');
            if (advanced) hideModal(advanced);
            openStickerGroupManager();
        });
    }
}

window.stickerFingerprint = stickerFingerprint;
window.recordStickerRecent = recordStickerRecent;
window.getRecentStickers = getRecentStickers;
window.clearStickerRecent = clearStickerRecent;
window.getStickerFpMap = getStickerFpMap;
window.stickerGroupsFor = stickerGroupsFor;
window.stickerLibraryFor = stickerLibraryFor;
window.openStickerGroupManager = openStickerGroupManager;
window.initStickerGroups = initStickerGroups;
