/* 抉择 / 问问 TA：单选题 / 多选题 / 文字题 */

const ASK_TYPE_META = {
    single: { label: '单选题', desc: 'TA 会从下面的答案里选一个回答你' },
    multi: { label: '多选题', desc: 'TA 会从下面的答案里勾几个回答你（2~3 个）' },
    text: { label: '文字题', desc: 'TA 会用字卡库「主字卡」里的字卡回答（1~8 张，多张之间空一格）' }
};

let askDraft = null;
let askBound = false;
const askScheduledIds = new Set();

function askDefaultDraft() {
    return {
        type: 'single',
        q: '',
        answers: '',
        qImage: '',
        images: [],
        mmax: 3,
        repeat: true,
        merge: true,
        tmin: 2,
        unit: 's'
    };
}

function askStorageKey() {
    try {
        if (typeof getStorageKey === 'function') return getStorageKey('askDraft');
    } catch (e) {}
    return 'askDraft';
}

function askClamp(n, min, max) {
    n = Number(n);
    if (!isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
}

function askGetDraft() {
    if (askDraft) return askDraft;
    const d = askDefaultDraft();
    try {
        const raw = localStorage.getItem(askStorageKey());
        if (raw) {
            const saved = JSON.parse(raw);
            if (saved && typeof saved === 'object') {
                Object.keys(d).forEach(k => {
                    if (saved[k] !== undefined) d[k] = saved[k];
                });
            }
        }
    } catch (e) {}
    if (!ASK_TYPE_META[d.type]) d.type = 'single';
    d.q = typeof d.q === 'string' ? d.q : '';
    d.answers = typeof d.answers === 'string' ? d.answers : '';
    d.qImage = typeof d.qImage === 'string' ? d.qImage : '';
    if (!Array.isArray(d.images)) d.images = [];
    d.images = d.images.filter(x => typeof x === 'string' && x);
    d.mmax = Math.round(askClamp(d.mmax, 2, 12));
    d.repeat = d.repeat !== false;
    d.merge = d.merge !== false;
    d.tmin = askClamp(d.tmin, 1, 9999);
    if (d.unit !== 'm') d.unit = 's';
    delete d.timeMode;
    delete d.tmax;
    askDraft = d;
    return d;
}

function askSaveDraft() {
    if (!askDraft) return;
    try {
        localStorage.setItem(askStorageKey(), JSON.stringify(askDraft));
    } catch (e) {
        console.warn('[ask] 保存提问草稿失败:', e);
    }
}

/* ---------- 打开与表单 ---------- */

function askOpen() {
    const modal = document.getElementById('decision-menu-modal');
    if (!modal) return;
    askBindOnce();
    askFillForm(askGetDraft());
    showModal(modal);
}

function askBindOnce() {
    if (askBound) return;
    const modal = document.getElementById('decision-menu-modal');
    if (!modal) return;
    askBound = true;

    const $ = id => document.getElementById(id);
    const qEl = $('ask-question');
    const answersEl = $('ask-answers');
    const repeatEl = $('ask-repeat');
    const mmaxEl = $('ask-mmax');
    const mmaxUp = $('ask-mmax-up');
    const mergeBtn = $('ask-merge-btn');
    const timeMinEl = $('ask-time-min');
    const qImageInput = $('ask-question-image-input');
    const answerImageInput = $('ask-answer-image-input');
    const qPreview = $('ask-question-image-preview');
    const answerList = $('ask-answer-image-list');

    $('close-decision-menu').addEventListener('click', () => askClose());
    $('ask-cancel').addEventListener('click', () => askClose());
    $('ask-send').addEventListener('click', askSend);

    document.querySelectorAll('#ask-type-tabs .ask-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = askGetDraft();
            askPullForm();
            d.type = btn.dataset.askType;
            askSaveDraft();
            askApplyType(d);
        });
    });

    qEl.addEventListener('input', () => {
        askGetDraft().q = qEl.value;
        askSaveDraft();
    });
    answersEl.addEventListener('input', () => {
        askGetDraft().answers = answersEl.value;
        askSaveDraft();
    });

    // 清空按钮：只清空内容，不收起手机键盘
    const bindClear = (btn, textarea, field) => {
        if (!btn || !textarea) return;
        ['pointerdown', 'mousedown'].forEach(evt => {
            btn.addEventListener(evt, e => e.preventDefault(), { passive: false });
        });
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const d = askGetDraft();
            textarea.value = '';
            d[field] = '';
            askSaveDraft();
            try {
                textarea.focus({ preventScroll: true });
                textarea.setSelectionRange(0, 0);
            } catch (err) {
                textarea.focus();
            }
        });
    };
    bindClear($('ask-question-clear'), qEl, 'q');
    bindClear($('ask-answers-clear'), answersEl, 'answers');

    repeatEl.addEventListener('change', () => {
        askGetDraft().repeat = repeatEl.checked;
        askSaveDraft();
    });
    mergeBtn.addEventListener('click', () => {
        const d = askGetDraft();
        d.merge = !d.merge;
        mergeBtn.classList.toggle('active', d.merge);
        mergeBtn.title = d.merge
            ? '开启后，文字和图片答案会合并在一起让 TA 选择'
            : '已关闭：图片答案不参与回答，仅从文字答案里选';
        askApplyType(d, true);
        askSaveDraft();
    });

    mmaxEl.addEventListener('input', () => {
        const d = askGetDraft();
        const v = parseInt(mmaxEl.value, 10);
        if (isFinite(v)) {
            d.mmax = askClamp(v, 2, 12);
            askApplyType(d, true);
            askSaveDraft();
        }
    });
    mmaxEl.addEventListener('blur', () => {
        const d = askGetDraft();
        d.mmax = Math.round(askClamp(parseInt(mmaxEl.value, 10), 2, 12));
        mmaxEl.value = d.mmax;
        askApplyType(d, true);
        askSaveDraft();
    });
    mmaxUp.addEventListener('click', () => {
        const d = askGetDraft();
        d.mmax = d.mmax >= 12 ? 2 : d.mmax + 1;
        mmaxEl.value = d.mmax;
        askApplyType(d, true);
        askSaveDraft();
    });

    timeMinEl.addEventListener('input', () => {
        const d = askGetDraft();
        const v = parseFloat(timeMinEl.value);
        if (isFinite(v) && v >= 1) {
            d.tmin = v;
            askSaveDraft();
        }
    });
    timeMinEl.addEventListener('blur', () => {
        const d = askGetDraft();
        d.tmin = Math.max(1, parseFloat(timeMinEl.value) || 1);
        askFillTime(d);
        askSaveDraft();
    });

    document.querySelectorAll('#ask-unit-toggle button').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = askGetDraft();
            d.unit = btn.dataset.askUnit;
            askSaveDraft();
            askFillTime(d);
        });
    });

    const qImageBtn = $('ask-question-image-btn');
    if (qImageBtn && qImageInput) {
        qImageBtn.addEventListener('click', () => qImageInput.click());
        qImageInput.addEventListener('change', async e => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                showNotification('图片大小不能超过 5MB', 'warning');
                return;
            }
            try {
                const src = typeof optimizeImage === 'function'
                    ? await optimizeImage(file, 800, 0.75)
                    : await askReadFile(file);
                askGetDraft().qImage = src;
                askRenderImages(askGetDraft());
                askSaveDraft();
            } catch (err) {
                console.warn('[ask] 问题图片处理失败:', err);
                showNotification('图片处理失败', 'error');
            }
        });
    }

    const answerImageBtn = $('ask-answer-image-btn');
    if (answerImageBtn && answerImageInput) {
        answerImageBtn.addEventListener('click', () => answerImageInput.click());
        answerImageInput.addEventListener('change', async e => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (!files.length) return;
            const d = askGetDraft();
            showNotification('正在处理图片...', 'info', 1200);
            for (const file of files) {
                if (d.images.length >= 12) {
                    showNotification('最多添加 12 张图片答案', 'warning');
                    break;
                }
                if (file.size > 5 * 1024 * 1024) {
                    showNotification('有图片超过 5MB，已跳过', 'warning');
                    continue;
                }
                try {
                    const src = typeof optimizeImage === 'function'
                        ? await optimizeImage(file, 800, 0.75)
                        : await askReadFile(file);
                    d.images.push(src);
                } catch (err) {
                    console.warn('[ask] 答案图片处理失败:', err);
                }
            }
            askRenderImages(d);
            askSaveDraft();
        });
    }

    if (qPreview) {
        qPreview.addEventListener('click', e => {
            const btn = e.target.closest('[data-ask-remove]');
            if (!btn) return;
            askGetDraft().qImage = '';
            askRenderImages(askGetDraft());
            askSaveDraft();
        });
    }
    if (answerList) {
        answerList.addEventListener('click', e => {
            const btn = e.target.closest('[data-ask-remove]');
            if (!btn) return;
            const idx = parseInt(btn.dataset.index, 10);
            const d = askGetDraft();
            if (isFinite(idx)) d.images.splice(idx, 1);
            askRenderImages(d);
            askSaveDraft();
        });
    }
}

function askReadFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function askFillForm(d) {
    const qEl = document.getElementById('ask-question');
    const answersEl = document.getElementById('ask-answers');
    const repeatEl = document.getElementById('ask-repeat');
    const mmaxEl = document.getElementById('ask-mmax');
    if (qEl) qEl.value = d.q || '';
    if (answersEl) answersEl.value = d.answers || '';
    if (repeatEl) repeatEl.checked = d.repeat !== false;
    if (mmaxEl) mmaxEl.value = d.mmax;
    const mergeBtn = document.getElementById('ask-merge-btn');
    if (mergeBtn) {
        mergeBtn.classList.toggle('active', d.merge !== false);
        mergeBtn.title = d.merge !== false
            ? '开启后，文字和图片答案会合并在一起让 TA 选择'
            : '已关闭：图片答案不参与回答，仅从文字答案里选';
    }
    askApplyType(d);
    askFillTime(d);
    askRenderImages(d);
}

function askApplyType(d, keepMmaxValue) {
    document.querySelectorAll('#ask-type-tabs .ask-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.askType === d.type);
    });
    const descEl = document.getElementById('ask-type-desc');
    if (descEl) {
        if (d.type === 'multi') {
            descEl.textContent = 'TA 会从下面的答案里勾几个回答你（2~' + d.mmax + ' 个）';
        } else {
            descEl.textContent = ASK_TYPE_META[d.type].desc;
        }
    }
    const answerSection = document.getElementById('ask-answer-section');
    const multiSection = document.getElementById('ask-multi-section');
    if (answerSection) answerSection.style.display = d.type === 'text' ? 'none' : '';
    if (multiSection) multiSection.style.display = d.type === 'multi' ? '' : 'none';
    const hint = document.getElementById('ask-answer-hint');
    if (hint) {
        if (d.merge === false) {
            hint.textContent = d.type === 'multi'
                ? 'TA 会从里面勾几个回答（仅文字答案）'
                : 'TA 会从里面选一个回答（仅文字答案）';
        } else {
            hint.textContent = d.type === 'multi'
                ? 'TA 会从里面勾几个回答（图也算一个答案）'
                : 'TA 会从里面选一个回答（图也算一个答案）';
        }
    }
    if (!keepMmaxValue) {
        const mmaxEl = document.getElementById('ask-mmax');
        if (mmaxEl) mmaxEl.value = d.mmax;
    }
}

function askFillTime(d) {
    const minEl = document.getElementById('ask-time-min');
    const hintEl = document.getElementById('ask-time-hint');
    if (minEl) minEl.value = d.tmin;
    if (hintEl) hintEl.textContent = 'TA 会在设定时间后回答你，不跟随「回复节奏」里那一格';
    document.querySelectorAll('#ask-unit-toggle button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.askUnit === d.unit);
    });
}

function askRenderImages(d) {
    const qPreview = document.getElementById('ask-question-image-preview');
    if (qPreview) {
        qPreview.innerHTML = d.qImage
            ? '<div class="ask-attach-item"><img src="' + askEsc(d.qImage) + '" alt="问题图片"><button type="button" class="ask-attach-remove" data-ask-remove="question" title="移除"><i class="fas fa-times"></i></button></div>'
            : '';
        qPreview.classList.toggle('has-items', !!d.qImage);
    }
    const answerList = document.getElementById('ask-answer-image-list');
    if (answerList) {
        answerList.innerHTML = (d.images || []).map((src, i) =>
            '<div class="ask-attach-item"><img src="' + askEsc(src) + '" alt="答案图片"><button type="button" class="ask-attach-remove" data-ask-remove="image" data-index="' + i + '" title="移除"><i class="fas fa-times"></i></button></div>'
        ).join('');
        answerList.classList.toggle('has-items', (d.images || []).length > 0);
    }
}

function askPullForm() {
    const d = askGetDraft();
    const qEl = document.getElementById('ask-question');
    const answersEl = document.getElementById('ask-answers');
    const repeatEl = document.getElementById('ask-repeat');
    const mmaxEl = document.getElementById('ask-mmax');
    const minEl = document.getElementById('ask-time-min');
    if (qEl) d.q = qEl.value;
    if (answersEl) d.answers = answersEl.value;
    if (repeatEl) d.repeat = repeatEl.checked;
    if (mmaxEl) d.mmax = Math.round(askClamp(parseInt(mmaxEl.value, 10), 2, 12));
    if (minEl) d.tmin = Math.max(1, parseFloat(minEl.value) || 1);
    return d;
}

function askClose() {
    const modal = document.getElementById('decision-menu-modal');
    if (!modal) return;
    askPullForm();
    askSaveDraft();
    hideModal(modal);
}

/* ---------- 发送与回答 ---------- */

function askUnitMs(unit) {
    return unit === 'm' ? 60000 : 1000;
}

function askDelayMs(d) {
    return Math.max(1, d.tmin) * askUnitMs(d.unit);
}

function askSend() {
    const modal = document.getElementById('decision-menu-modal');
    const d = askPullForm();
    const q = String(d.q || '').trim();
    if (!q) {
        showNotification('先写下你的问题', 'warning');
        const qEl = document.getElementById('ask-question');
        if (qEl) qEl.focus();
        return;
    }

    let opts = [];
    if (d.type !== 'text') {
        const lines = String(d.answers || '')
            .split(/\r\n|\r|\n/)
            .map(s => s.trim())
            .filter(Boolean)
            .slice(0, 12);
        opts = lines.map(text => ({ text }));
        if (d.merge !== false) {
            (d.images || []).slice(0, 12).forEach(image => opts.push({ image }));
        }
        if (opts.length < 2) {
            showNotification('至少写 2 个答案，每行一个', 'warning');
            const answersEl = document.getElementById('ask-answers');
            if (answersEl) answersEl.focus();
            return;
        }
    }

    d.q = q;
    askSaveDraft();

    const message = {
        id: Date.now(),
        sender: 'user',
        text: '',
        timestamp: new Date(),
        status: 'sent',
        favorited: false,
        note: null,
        type: 'ask',
        askType: d.type,
        q: q,
        qImage: d.qImage || '',
        opts: opts,
        mmax: d.mmax,
        delay: askDelayMs(d),
        askStatus: 'pending',
        createdAt: Date.now()
    };

    addMessage(message);
    if (typeof playSound === 'function') playSound('send');
    if (!d.repeat) {
        askDraft = askDefaultDraft();
        askSaveDraft();
    }
    if (modal) hideModal(modal);
    askSchedule(message);
}

function askSchedule(msg, waitOverride) {
    if (!msg || msg.type !== 'ask' || msg.askStatus === 'answered') return;
    const key = String(msg.id);
    if (askScheduledIds.has(key)) return;
    askScheduledIds.add(key);

    const wait = Math.max(600, Number(waitOverride != null ? waitOverride : msg.delay) || 4000);
    const typingAt = Math.max(0, wait - 900);
    setTimeout(askShowTyping, typingAt);
    setTimeout(() => {
        askHideTyping();
        askAnswer(msg);
    }, wait);
}

function askAnswer(msg) {
    askScheduledIds.delete(String(msg.id));
    const m = (messages || []).find(x => String(x.id) === String(msg.id));
    if (!m || m.type !== 'ask' || m.askStatus === 'answered') return;

    if (m.askType === 'text') {
        const pool = askTextPool();
        if (!pool.length) {
            m.cards = [];
            m.answerText = '（主字卡为空，先去字卡库加几条吧）';
        } else {
            const count = Math.min(pool.length, 1 + Math.floor(Math.random() * 8));
            m.cards = askShuffle(pool.slice()).slice(0, count);
            m.answerText = m.cards.join(' ');
        }
    } else {
        const opts = Array.isArray(m.opts) ? m.opts : [];
        if (m.askType === 'multi') {
            const max = Math.min(opts.length, Math.max(2, Math.min(12, Number(m.mmax) || 3)));
            const want = 2 + Math.floor(Math.random() * Math.max(1, max - 1));
            const picks = askShuffle(opts.map((_, i) => i)).slice(0, Math.min(want, opts.length));
            m.picks = picks.sort((a, b) => a - b);
        } else {
            m.picks = opts.length ? [Math.floor(Math.random() * opts.length)] : [];
        }
        m.answerText = '';
    }

    m.askStatus = 'answered';
    m.answeredAt = Date.now();
    m.status = 'read';
    askUpdateCard(m);
    if (typeof _updateReadReceiptsDOM === 'function') _updateReadReceiptsDOM();
    if (typeof playSound === 'function') playSound('message');
    if (typeof throttledSaveData === 'function') throttledSaveData();
}

function askUpdateCard(msg) {
    const wrappers = document.querySelectorAll('.message-wrapper');
    for (let i = 0; i < wrappers.length; i++) {
        if (String(wrappers[i].dataset.id) === String(msg.id)) {
            const card = wrappers[i].querySelector('.ask-message-card');
            if (card) card.outerHTML = askCardHTML(msg);
            return;
        }
    }
}

function resumeAskMessages() {
    (messages || []).forEach(m => {
        if (!m || m.type !== 'ask' || m.askStatus === 'answered') return;
        const created = Number(m.createdAt) || new Date(m.timestamp).getTime() || Date.now();
        const elapsed = Date.now() - created;
        const wait = Math.max(700, (Number(m.delay) || 4000) - elapsed);
        askSchedule(m, wait);
    });
}
window.resumeAskMessages = resumeAskMessages;

function askTextPool() {
    const all = (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) ? customReplies : [];
    let disabled = new Set();
    try {
        const raw = localStorage.getItem('disabledReplyItems');
        if (raw) disabled = new Set(JSON.parse(raw));
    } catch (e) {}
    const disabledGroupItems = new Set();
    (window.customReplyGroups || []).forEach(g => {
        if (g && g.disabled && Array.isArray(g.items)) {
            g.items.forEach(item => disabledGroupItems.add(item));
        }
    });
    const seen = new Set();
    const pool = [];
    all.forEach(item => {
        const text = String(item || '').trim();
        if (!text || disabled.has(item) || disabledGroupItems.has(item) || seen.has(text)) return;
        seen.add(text);
        pool.push(text);
    });
    return pool;
}

function askShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }
    return arr;
}

/* ---------- 聊天里的提问卡 ---------- */

function askEsc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function askCardHTML(msg) {
    const answered = msg.askStatus === 'answered';
    const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || 'TA';
    let body = '';

    if (msg.askType === 'text') {
        const text = answered
            ? (msg.answerText || (Array.isArray(msg.cards) ? msg.cards.join(' ') : ''))
            : '';
        if (text) body = '<div class="ask-card-text">' + askEsc(text) + '</div>';
    } else {
        const picks = Array.isArray(msg.picks) ? msg.picks : [];
        const opts = Array.isArray(msg.opts) ? msg.opts : [];
        body = '<div class="ask-card-options">' + opts.map((opt, i) => {
            const picked = answered && picks.indexOf(i) >= 0;
            const content = opt && opt.image
                ? '<img class="ask-card-opt-img" src="' + askEsc(opt.image) + '" alt="图片答案" onclick="viewImage(this.src)">'
                : askEsc(opt && opt.text);
            return '<div class="ask-card-option' + (picked ? ' picked' : '') + '">'
                + '<span class="ask-card-num">' + (i + 1) + '.</span>'
                + '<span class="ask-card-opt-body">' + content + '</span>'
                + '</div>';
        }).join('') + '</div>';
    }

    const qImage = msg.qImage
        ? '<img class="ask-card-qimg" src="' + askEsc(msg.qImage) + '" alt="问题图片" onclick="viewImage(this.src)">'
        : '';
    const status = answered ? '已回答' : '等待 ' + askEsc(partnerName) + ' 回答…';

    return '<div class="ask-message-card">'
        + '<div class="ask-card-head"><span class="ask-card-pill" title="抉择"><i class="fas fa-balance-scale"></i></span><span class="ask-card-status">' + status + '</span></div>'
        + '<div class="ask-card-question">' + askEsc(msg.q || '') + '</div>'
        + qImage + body
        + '</div>';
}

/* ---------- 正在输入 ---------- */

function askShowTyping() {
    if (typeof settings === 'undefined' || !settings.typingIndicatorEnabled) return;
    const wrapper = document.getElementById('typing-indicator-wrapper');
    if (!wrapper) return;
    const label = document.getElementById('typing-indicator-label');
    if (label) label.textContent = (settings.partnerName || '对方') + ' 正在输入';
    const avatar = document.getElementById('typing-indicator-avatar');
    if (avatar) {
        try {
            const img = document.querySelector('#partner-avatar img');
            avatar.innerHTML = img ? '<img src="' + img.src + '">' : '<i class="fas fa-user"></i>';
        } catch (e) {}
    }
    try {
        if (typeof positionTypingIndicator === 'function') positionTypingIndicator();
    } catch (e) {}
    wrapper.style.display = 'block';
    try {
        if (DOMElements.chatContainer) DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
    } catch (e) {}
}

function askHideTyping() {
    const wrapper = document.getElementById('typing-indicator-wrapper');
    if (!wrapper) return;
    const inner = wrapper.querySelector('.typing-indicator');
    if (inner) {
        inner.classList.add('hiding');
        setTimeout(() => {
            wrapper.style.display = 'none';
            inner.classList.remove('hiding');
        }, 240);
    } else {
        wrapper.style.display = 'none';
    }
}

/* ---------- 初始化 ---------- */

function initDecisionModule() {
    const entryBtn = document.getElementById('decision-function');
    if (entryBtn && !entryBtn.dataset.askInitialized) {
        entryBtn.dataset.askInitialized = 'true';
        entryBtn.addEventListener('click', () => {
            const advanced = document.getElementById('advanced-modal');
            if (advanced) hideModal(advanced);
            askOpen();
        });
    }
    askBindOnce();
}
