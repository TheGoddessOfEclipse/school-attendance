// ==================== 1. 立體星環班種設定（動態同步 Firebase） ====================
const DEFAULT_CATEGORIES = [
    '周間普通班', '周間分組班(數)', '周間分組班(英)', '周間分組班(自)',
    '周間晚自習', '週六假日班', '週六資優班', '校隊', '社團'
];

const CATEGORY_META_MAP = {
    '周間普通班': { short: '普通班', sub: '周間', icon: '🏫' },
    '周間分組班(數)': { short: '數學分組', sub: '周間', icon: '📐' },
    '周間分組班(英)': { short: '英語分組', sub: '周間', icon: '🔤' },
    '周間分組班(自)': { short: '自然分組', sub: '周間', icon: '🔬' },
    '周間晚自習': { short: '晚自習', sub: '周間', icon: '🌙' },
    '週六假日班': { short: '假日班', sub: '週六', icon: '☀️' },
    '週六資優班': { short: '資優班', sub: '週六', icon: '✨' },
    '校隊': { short: '校隊', sub: '代表隊', icon: '🏆' },
    '社團': { short: '社團', sub: '活動', icon: '🎨' }
};

let CATEGORIES = [];
let STEP_ANGLE = (Math.PI * 2) / DEFAULT_CATEGORIES.length;
const MIN_SCALE = 0.66;
const MAX_SCALE = 1.22;

let orbitAngle = 0;
let targetAngle = null;
let angularVelocity = 0;
let isDragging = false;
let hasDragged = false;
let dragStartX = 0;
let dragStartY = 0;
let lastPointerAngle = 0;
let lastPointerX = 0;
let activeIndex = 0;
let satelliteEls = [];

// ==================== 2. 座位表與批次點名狀態 ====================
const chart = document.getElementById('seatingChart');
const dateInput = document.getElementById('dateSelect');

let currentTeacherName = "";
let currentCategory = "";
let lastSelectedClass = "";
let lastSelectedDate = "";
let interactionMode = 'swipe'; // 'swipe'（滑動點名）| 'seat'（調整座位）

let dailyListenerRef = null;
let originalStudentsMap = {};
let draftStudents = [];
let hasUnsavedChanges = false;

// 課程時長與跨班點名提醒資料
let courseDurations = { categories: {}, classes: {} };
let otherClassNoticesByKey = {};
let dismissedNoticeSigs = {};
let activeNoticeStu = null;

let activeSheetStuId = null;
let currentEditStuId = null;
let toastTimer = null;

function getLocalTodayDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getCurrentTimeHHMM() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function formatHHMM(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function initCurrentTeacherName() {
    if (typeof firebase === 'undefined' || !firebase.auth) return;
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) return;
        try {
            const snap = await window.db.ref(`users/${user.uid}/name`).once('value');
            currentTeacherName = snap.val() || user.displayName || user.email || '老師';
        } catch (_) {
            currentTeacherName = user.displayName || user.email || '老師';
        }
    });
}
initCurrentTeacherName();

// ==================== 3. 課程時長與跨班提醒比對邏輯 ====================
async function loadCourseDurations() {
    try {
        const snap = await window.db.ref('courseDurations').once('value');
        const val = snap.val() || {};
        courseDurations = {
            categories: val.categories || {},
            classes: val.classes || {}
        };
    } catch (err) {
        console.error("讀取課程時長失敗，改用預設 45 分鐘：", err);
    }
}
loadCourseDurations();

function getCourseDurationMinutes(cat, cls) {
    const clsDur = courseDurations.classes?.[cat]?.[cls];
    if (clsDur && Number(clsDur) > 0) return Number(clsDur);
    const catDur = courseDurations.categories?.[cat];
    if (catDur && Number(catDur) > 0) return Number(catDur);
    return 45;
}

// 每 30 秒自動檢查一次，過了課程時長的紅點會自動消失
setInterval(() => {
    if (typeof updateNoticeDotsOnly === 'function') updateNoticeDotsOnly();
}, 30000);

function getStudentMatchKeys(stu, category, className) {
    const keys = [];
    if (stu.studentNumber) keys.push(`num:${String(stu.studentNumber).trim()}`);
    const hr = (category === '周間普通班') ? className : (stu.originalClass || '');
    if (hr && stu.name) keys.push(`hr:${String(hr).trim()}_${String(stu.name).trim()}`);
    if (keys.length === 0 && stu.name) keys.push(`name:${String(stu.name).trim()}`);
    return keys;
}

function rebuildCrossClassNotices(dailyData, curCat, curCls) {
    const map = {};
    const now = Date.now();
    if (!dailyData) {
        otherClassNoticesByKey = {};
        return;
    }
    for (const cat in dailyData) {
        if (!dailyData[cat]) continue;
        for (const cls in dailyData[cat]) {
            if (cat === curCat && cls === curCls) continue;
            const list = dailyData[cat][cls];
            if (!Array.isArray(list)) continue;

            const durationMs = getCourseDurationMinutes(cat, cls) * 60 * 1000;

            list.forEach(s => {
                if (!s || s.id === '_placeholder' || !s.status || s.status === '未點名') return;
                if (!s.updatedAt) return;

                const expiresAt = s.updatedAt + durationMs;
                if (now > expiresAt) return;

                const record = {
                    category: cat,
                    className: cls,
                    status: s.status,
                    reason: s.reason || '',
                    note: s.note || '',
                    timeIn: s.timeIn || '',
                    timeOut: s.timeOut || '',
                    updatedBy: s.updatedBy || '',
                    updatedAt: s.updatedAt,
                    expiresAt: expiresAt
                };
                getStudentMatchKeys(s, cat, cls).forEach(k => {
                    if (!map[k]) map[k] = [];
                    map[k].push(record);
                });
            });
        }
    }
    otherClassNoticesByKey = map;
}

function getCrossClassNotices(stu) {
    const selEl = document.getElementById('adminClassSelect') || document.getElementById('classSelect');
    const className = (selEl ? selEl.value : '') || lastSelectedClass || '';
    const keys = getStudentMatchKeys(stu, currentCategory, className);
    const now = Date.now();
    const seen = new Set();
    const results = [];

    keys.forEach(k => {
        (otherClassNoticesByKey[k] || []).forEach(rec => {
            if (rec.expiresAt && now > rec.expiresAt) return;
            const uniq = `${rec.category}|${rec.className}`;
            if (!seen.has(uniq)) {
                seen.add(uniq);
                results.push(rec);
            }
        });
    });

    results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return results;
}

function getNoticeSignature(notices) {
    return notices
        .map(n => `${n.category}|${n.className}|${n.status}|${n.updatedAt}|${n.reason}|${n.timeIn}|${n.timeOut}`)
        .join(';;');
}

function getNoticeReadKey(stuId) {
    const cls = document.getElementById('classSelect').value || lastSelectedClass || '';
    return `${dateInput.value}_${currentCategory}_${cls}_${stuId}`;
}

function hasUnreadCrossNotice(stu) {
    const notices = getCrossClassNotices(stu);
    if (notices.length === 0) return false;
    return dismissedNoticeSigs[getNoticeReadKey(stu.id)] !== getNoticeSignature(notices);
}

function updateNoticeDotsOnly() {
    draftStudents.forEach(stu => {
        const badge = document.getElementById(`stu_${stu.id}`);
        if (!badge) return;
        const dot = badge.querySelector('.cross-notice-dot');
        if (dot) {
            dot.style.display = hasUnreadCrossNotice(stu) ? 'block' : 'none';
        }
    });
}

function openCrossNoticeModal(stu) {
    const notices = getCrossClassNotices(stu);
    if (notices.length === 0) return;

    activeNoticeStu = stu;
    document.getElementById('crossNoticeTitle').innerText = `${stu.id}號 ${stu.name} — 今日他班點名紀錄`;

    const listEl = document.getElementById('crossNoticeList');
    listEl.innerHTML = notices.map(rec => {
        const timeStr = rec.updatedAt ? formatHHMM(rec.updatedAt) : '今日稍早';
        const teacherStr = rec.updatedBy ? `${rec.updatedBy} 老師` : '其他老師';
        let extraParts = [];
        if (rec.status === '部分出席' && (rec.timeIn || rec.timeOut)) {
            extraParts.push(`時間：${rec.timeIn || '--:--'} ~ ${rec.timeOut || '--:--'}`);
        }
        if (rec.reason) extraParts.push(`原因：${rec.reason}`);
        if (rec.note) extraParts.push(`備註：${rec.note}`);
        const extraHtml = extraParts.length > 0
            ? `<span class="notice-extra">${extraParts.join(' ｜ ')}</span>`
            : '';

        return `
            <div class="notice-item">
                本生於 <strong>${timeStr}</strong> 曾被 <strong>${teacherStr}</strong> 於【${rec.category} - ${rec.className}】點名為 <span class="notice-status-pill">${rec.status}</span>
                ${extraHtml}
            </div>
        `;
    }).join('');

    document.getElementById('crossNoticeModal').style.display = 'flex';
}

function dismissCrossNoticeModal() {
    if (activeNoticeStu) {
        const notices = getCrossClassNotices(activeNoticeStu);
        if (notices.length > 0) {
            dismissedNoticeSigs[getNoticeReadKey(activeNoticeStu.id)] = getNoticeSignature(notices);
        }
        activeNoticeStu = null;
        updateNoticeDotsOnly();
    }
    document.getElementById('crossNoticeModal').style.display = 'none';
}

function handleStudentCardClick(studentId) {
    const stu = draftStudents.find(s => String(s.id) === String(studentId));
    if (!stu) return;
    if (hasUnreadCrossNotice(stu)) {
        openCrossNoticeModal(stu);
        return;
    }
    openModal(studentId);
}

// ==================== 4. 提示與防呆工具 ====================
function showToast(msg) {
    const box = document.getElementById('toastBox');
    if (!box) return;
    box.innerText = msg;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 2400);
}

function isStudentModified(stu) {
    const orig = originalStudentsMap[String(stu.id)];
    if (!orig) return false;
    return (
        (orig.status || "未點名") !== (stu.status || "未點名") ||
        (orig.reason || "") !== (stu.reason || "") ||
        (orig.note || "") !== (stu.note || "") ||
        (orig.timeIn || "") !== (stu.timeIn || "") ||
        (orig.timeOut || "") !== (stu.timeOut || "")
    );
}

function getModifiedStudents() {
    return draftStudents.filter(s => s.id !== "_placeholder" && isStudentModified(s));
}

function refreshDirtyUI() {
    const modifiedCount = getModifiedStudents().length;
    hasUnsavedChanges = modifiedCount > 0;

    const submitBtn = document.getElementById('btnSubmitAttendance');
    const pill = document.getElementById('unsavedIndicator');

    if (submitBtn) {
        submitBtn.classList.toggle('has-unsaved', hasUnsavedChanges);
        submitBtn.innerText = hasUnsavedChanges
            ? `💾 送出點名 (${modifiedCount})`
            : '💾 送出點名';
    }
    if (pill) {
        pill.style.display = hasUnsavedChanges ? 'inline-block' : 'none';
        pill.innerText = `● ${modifiedCount} 筆變更尚未送出`;
    }
}

function confirmLeaveIfDirty() {
    if (!hasUnsavedChanges) return true;
    return confirm("目前尚有未送出的點名變更，離開將會遺失暫存資料，確定要離開嗎？");
}

window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ==================== 5. 系統初始化與立體星環物理引擎 ====================
async function loadTeacherCategories() {
    let list = [...DEFAULT_CATEGORIES];
    try {
        const snap = await window.db.ref('categories').once('value');
        const raw = snap.val();
        if (raw) {
            const parsed = Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw).filter(Boolean);
            if (parsed.length > 0) list = parsed;
        }
    } catch (err) {
        console.error("讀取班種失敗，改用預設清單：", err);
    }

    CATEGORIES = list.map(key => {
        const meta = CATEGORY_META_MAP[key] || {
            short: key.length > 5 ? key.slice(0, 5) : key,
            sub: '自訂',
            icon: '📚'
        };
        return { key, ...meta };
    });
    STEP_ANGLE = (Math.PI * 2) / CATEGORIES.length;
}

async function initSystem() {
    try {
        let snap = await window.db.ref('rosterTemplate').once('value');
        if (!snap.exists()) {
            await window.db.ref('rosterTemplate').set({ "周間普通班": {} });
        }
        const today = getLocalTodayDate();
        dateInput.value = today;
        lastSelectedDate = today;

        await loadTeacherCategories();
        initOrbitMenu();
    } catch (error) {
        console.error("Firebase 連線錯誤:", error);
        alert("無法連線到雲端資料庫，請確認設定！");
    }
}

function initOrbitMenu() {
    const container = document.getElementById('orbitSatellites');
    const stage = document.getElementById('orbitStage');
    if (!container || !stage) return;

    container.innerHTML = '';
    satelliteEls = CATEGORIES.map((cat, idx) => {
        const el = document.createElement('div');
        el.className = 'sat-diamond';
        el.dataset.index = idx;
        el.innerHTML = `
            <div class="sat-inner">
                <span class="sat-icon">${cat.icon}</span>
                <span class="sat-name">${cat.short}</span>
                <span class="sat-sub">${cat.sub}</span>
            </div>
        `;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hasDragged) return;
            if (idx === activeIndex) {
                selectCategory(CATEGORIES[idx].key);
            } else {
                rotateToIndex(idx);
            }
        });
        container.appendChild(el);
        return el;
    });

    bindOrbitGestures(stage);
    window.addEventListener('resize', renderOrbitPositions);
    requestAnimationFrame(animateOrbit);
}

function getOrbitRadii() {
    const stage = document.getElementById('orbitStage');
    const w = stage ? stage.clientWidth || 920 : 920;
    const h = stage ? stage.clientHeight || 500 : 500;
    const satSize = (satelliteEls[0] && satelliteEls[0].offsetWidth) ? satelliteEls[0].offsetWidth : 102;

    const padX = satSize * 0.72 + 12;
    const padY = satSize * 0.90 + 14;

    const rx = Math.max(105, (w / 2) - padX);
    const maxRy = Math.max(76, (h / 2) - padY);
    const ry = Math.min(maxRy, rx * 0.62);

    return { rx, ry };
}

function bindOrbitGestures(stage) {
    function getPointerAngle(clientX, clientY) {
        const rect = stage.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        return { angle: Math.atan2(dy, dx), dist: Math.hypot(dx, dy) };
    }

    stage.addEventListener('pointerdown', (e) => {
        if (e.target.closest('#centerDiamond')) return;
        isDragging = true;
        hasDragged = false;
        targetAngle = null;
        angularVelocity = 0;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        lastPointerX = e.clientX;
        lastPointerAngle = getPointerAngle(e.clientX, e.clientY).angle;
        stage.classList.add('dragging');
        if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
    });

    stage.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const moveDist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
        if (moveDist > 7) hasDragged = true;

        const { angle, dist } = getPointerAngle(e.clientX, e.clientY);
        let delta = 0;

        if (dist > 32) {
            delta = angle - lastPointerAngle;
            if (delta > Math.PI) delta -= Math.PI * 2;
            if (delta < -Math.PI) delta += Math.PI * 2;
        } else {
            delta = -(e.clientX - lastPointerX) * 0.008;
        }

        orbitAngle += delta;
        angularVelocity = angularVelocity * 0.45 + delta * 0.55;
        lastPointerAngle = angle;
        lastPointerX = e.clientX;
    });

    const endDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        stage.classList.remove('dragging');
        if (stage.releasePointerCapture && e.pointerId !== undefined) {
            try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        if (Math.abs(angularVelocity) < 0.008) {
            snapToNearest();
        }
        setTimeout(() => { hasDragged = false; }, 50);
    };

    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        stepOrbit(dir);
    }, { passive: false });
}

function snapToNearest() {
    targetAngle = Math.round(orbitAngle / STEP_ANGLE) * STEP_ANGLE;
}

function stepOrbit(direction) {
    const base = (targetAngle !== null) ? targetAngle : Math.round(orbitAngle / STEP_ANGLE) * STEP_ANGLE;
    targetAngle = base - direction * STEP_ANGLE;
    angularVelocity = 0;
}

function rotateToIndex(idx) {
    const desiredMod = -idx * STEP_ANGLE;
    let diff = (desiredMod - orbitAngle) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    targetAngle = orbitAngle + diff;
    angularVelocity = 0;
}

function enterActiveCategory() {
    if (hasDragged || CATEGORIES.length === 0) return;
    selectCategory(CATEGORIES[activeIndex].key);
}

function animateOrbit() {
    if (!isDragging) {
        if (targetAngle !== null) {
            const diff = targetAngle - orbitAngle;
            if (Math.abs(diff) < 0.0012) {
                orbitAngle = targetAngle;
                targetAngle = null;
            } else {
                orbitAngle += diff * 0.14;
            }
        } else if (Math.abs(angularVelocity) > 0.0005) {
            orbitAngle += angularVelocity;
            angularVelocity *= 0.92;
            if (Math.abs(angularVelocity) < 0.004) {
                angularVelocity = 0;
                snapToNearest();
            }
        }
    }

    renderOrbitPositions();
    requestAnimationFrame(animateOrbit);
}

function renderOrbitPositions() {
    if (satelliteEls.length === 0) return;
    const { rx, ry } = getOrbitRadii();

    let bestIdx = 0;
    let maxSin = -2;

    CATEGORIES.forEach((cat, idx) => {
        const theta = orbitAngle + idx * STEP_ANGLE + Math.PI / 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        if (sinT > maxSin) {
            maxSin = sinT;
            bestIdx = idx;
        }

        const x = cosT * rx;
        const y = sinT * ry;
        const depth = (sinT + 1) / 2;

        const scale = MIN_SCALE + depth * (MAX_SCALE - MIN_SCALE);
        const opacity = 0.42 + depth * 0.58;
        const zIndex = Math.round(5 + depth * 32);

        const el = satelliteEls[idx];
        el.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(3)}) rotate(45deg)`;
        el.style.opacity = opacity.toFixed(3);
        el.style.zIndex = zIndex;
    });

    if (bestIdx !== activeIndex || !satelliteEls[bestIdx].classList.contains('is-active')) {
        activeIndex = bestIdx;
        satelliteEls.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
        const activeCat = CATEGORIES[activeIndex];
        document.getElementById('activeCategoryName').innerText = activeCat.key;
        document.getElementById('centerCurrentLabel').innerText = activeCat.short;
    }
}

// ==================== 6. 進入班種與切換班級 ====================
async function selectCategory(category) {
    currentCategory = category;
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
    document.getElementById('selectedCategoryTitle').innerText = category;
    document.getElementById('lastUpdate').innerText = '請選擇班級';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const classSelect = document.getElementById('classSelect');
    classSelect.innerHTML = '<option value="">⏳ 讀取班級中...</option>';
    lastSelectedClass = "";
    draftStudents = [];
    originalStudentsMap = {};
    otherClassNoticesByKey = {};
    refreshDirtyUI();
    initGrid();

    try {
        let snap = await window.db.ref('rosterTemplate').once('value');
        let template = snap.val() || {};

        classSelect.innerHTML = '<option value="">請選擇班級...</option>';

        if (template[category]) {
            const sortedClasses = Object.keys(template[category]).sort((a, b) =>
                a.localeCompare(b, undefined, { numeric: true })
            );
            sortedClasses.forEach(className => {
                classSelect.innerHTML += `<option value="${className}">${className}</option>`;
            });
        }
    } catch (error) {
        classSelect.innerHTML = '<option value="">讀取失敗</option>';
        console.error(error);
    }
}

function goBack() {
    if (!confirmLeaveIfDirty()) return;
    hasUnsavedChanges = false;
    draftStudents = [];
    originalStudentsMap = {};
    otherClassNoticesByKey = {};
    lastSelectedClass = "";
    refreshDirtyUI();
    if (dailyListenerRef) dailyListenerRef.off();

    document.getElementById('step1').style.display = 'flex';
    document.getElementById('step2').style.display = 'none';
    renderOrbitPositions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setInteractionMode(mode) {
    if (mode === 'seat' && hasUnsavedChanges) {
        alert("⚠️ 您尚有未送出的點名資料，請先點擊講台右側「送出點名」再切換為調整座位模式！");
        return;
    }
    interactionMode = (mode === 'seat') ? 'seat' : 'swipe';
    document.getElementById('btnModeSwipe').classList.toggle('active', interactionMode === 'swipe');
    document.getElementById('btnModeSeat').classList.toggle('active', interactionMode === 'seat');
    chart.classList.toggle('mode-swipe', interactionMode === 'swipe');

    const hint = document.getElementById('modeHintText');
    if (hint) {
        hint.innerText = interactionMode === 'swipe'
            ? '💡 按住座位卡向四方向滑動點名，輕點可編輯備註；完成後請按「送出點名」'
            : '🪑 調整座位模式：拖曳學生名牌至空位或另一名同學上即可互換座位（即時儲存）';
    }
    renderGrid();
}

function initGrid() {
    chart.innerHTML = '';
    chart.classList.toggle('mode-swipe', interactionMode === 'swipe');
    for (let i = 0; i < 36; i++) {
        chart.innerHTML += `<div class="seat-slot" id="slot_${i}" ondragover="allowDrop(event)" ondrop="drop(event, ${i})"></div>`;
    }
}

function handleDateOrClassChange(source) {
    const classSelect = document.getElementById('classSelect');
    if (hasUnsavedChanges) {
        if (!confirm("目前尚有未送出的點名資料，切換班級／日期將會遺失暫存變更，確定要繼續嗎？")) {
            if (source === 'class') classSelect.value = lastSelectedClass;
            if (source === 'date') dateInput.value = lastSelectedDate;
            return;
        }
    }
    hasUnsavedChanges = false;
    lastSelectedClass = classSelect.value;
    lastSelectedDate = dateInput.value;
    loadSeatingChart();
}

// ==================== 7. 讀取與監聽當日班級資料 ====================
function loadSeatingChart() {
    const className = document.getElementById('classSelect').value;
    const date = dateInput.value;

    if (dailyListenerRef) dailyListenerRef.off();

    if (!className) {
        draftStudents = [];
        originalStudentsMap = {};
        otherClassNoticesByKey = {};
        refreshDirtyUI();
        initGrid();
        document.getElementById('lastUpdate').innerText = '請選擇班級';
        return;
    }

    lastSelectedClass = className;
    lastSelectedDate = date;
    document.getElementById('lastUpdate').innerText = '⏳ 載入座位表中...';

    dailyListenerRef = window.db.ref(`attendance_${date}`);
    dailyListenerRef.on('value', async (snap) => {
        let dailyData = null;

        if (snap.exists()) {
            dailyData = snap.val();
        } else {
            let tSnap = await window.db.ref('rosterTemplate').once('value');
            let template = tSnap.val() || {};
            let newData = {};
            for (let cat in template) {
                newData[cat] = {};
                for (let cls in template[cat]) {
                    let validStudents = template[cat][cls].filter(s => s.id !== "_placeholder");
                    newData[cat][cls] = validStudents.map(s => ({
                        ...s, status: "未點名", reason: "", note: "", timeIn: "", timeOut: ""
                    }));
                }
            }
            dailyData = newData;
            await window.db.ref(`attendance_${date}`).set(newData);
        }

        // 不論本地是否正在編輯，都即時更新跨班點名提醒紅點
        rebuildCrossClassNotices(dailyData, currentCategory, className);

        if (hasUnsavedChanges) {
            updateNoticeDotsOnly();
            document.getElementById('lastUpdate').innerText = `雲端有更新（本地編輯中）`;
            return;
        }

        const rawList = (dailyData && dailyData[currentCategory] && dailyData[currentCategory][className])
            ? dailyData[currentCategory][className]
            : [];

        const validList = rawList.filter(s => s && s.id !== "_placeholder");

        draftStudents = validList.map(s => ({
            ...s,
            status: s.status || "未點名",
            reason: s.reason || "",
            note: s.note || "",
            timeIn: s.timeIn || "",
            timeOut: s.timeOut || ""
        }));

        originalStudentsMap = {};
        draftStudents.forEach(s => {
            originalStudentsMap[String(s.id)] = { ...s };
        });

        refreshDirtyUI();
        renderGrid();
        document.getElementById('lastUpdate').innerText = `最後同步：${new Date().toLocaleTimeString()}`;
    });
}

// ==================== 8. 繪製 6×6 座位表與綁定手勢 ====================
function renderGrid() {
    initGrid();
    if (!draftStudents || draftStudents.length === 0) return;

    draftStudents.forEach(student => {
        let glowClass = "no-glow";
        if (student.status === "出席") glowClass = "glow-green";
        else if (student.status === "無故缺席") glowClass = "glow-red";
        else if (student.status === "部分出席") glowClass = "glow-purple";
        else if (["病假", "喪假", "事假", "因故缺席"].includes(student.status)) glowClass = "glow-yellow";

        const dirtyClass = isStudentModified(student) ? "is-dirty" : "";
        const showRedDot = hasUnreadCrossNotice(student);

        let extraInfo = "";
        if (student.status === "部分出席" && (student.timeIn || student.timeOut)) {
            extraInfo = `<div class="stu-note">🕒 ${student.timeIn || '--:--'}~${student.timeOut || ''}</div>`;
        } else if (student.note) {
            extraInfo = `<div class="stu-note">📝${student.note}</div>`;
        }

        const origClassBadge = (currentCategory !== '周間普通班' && student.originalClass)
            ? `<div style="font-size:10px; color:white; background:#8e44ad; border-radius:3px; padding:1px 5px; margin-bottom:2px; display:inline-block;">${student.originalClass}</div>` : "";

        const badge = document.createElement('div');
        badge.className = `student-badge ${glowClass} ${dirtyClass}`;
        badge.id = `stu_${student.id}`;
        badge.innerHTML = `
            <span class="cross-notice-dot" style="display:${showRedDot ? 'block' : 'none'};" title="今日在他班有點名紀錄"></span>
            ${origClassBadge}
            <span class="stu-name">${student.id} ${student.name}</span>
            <span class="stu-status">${student.status}</span>
            ${student.reason ? `<span class="stu-reason">(${student.reason})</span>` : ''}
            ${extraInfo}
            <div class="swipe-overlay-tag"></div>
        `;

        if (interactionMode === 'seat') {
            badge.setAttribute('draggable', 'true');
            badge.addEventListener('dragstart', (ev) => drag(ev, student.id));
            badge.addEventListener('click', () => handleStudentCardClick(student.id));
        } else {
            badge.setAttribute('draggable', 'false');
            bindSwipeEvents(badge, student.id);
        }

        let targetSlot = document.getElementById(`slot_${student.pos}`);
        if (targetSlot && targetSlot.children.length === 0) {
            targetSlot.appendChild(badge);
        } else {
            for (let i = 0; i < 36; i++) {
                let slot = document.getElementById(`slot_${i}`);
                if (slot && slot.children.length === 0) {
                    slot.appendChild(badge);
                    student.pos = i;
                    break;
                }
            }
        }
    });
}

// ==================== 9. 四向滑動手勢引擎 ====================
function bindSwipeEvents(badgeEl, studentId) {
    const SWIPE_THRESHOLD = 30;
    const overlayTag = badgeEl.querySelector('.swipe-overlay-tag');

    let isDown = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let currentDir = null;

    badgeEl.addEventListener('pointerdown', (e) => {
        if (interactionMode !== 'swipe') return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        isDown = true;
        hasMoved = false;
        currentDir = null;
        startX = e.clientX;
        startY = e.clientY;
        badgeEl.classList.add('is-swiping');
        if (badgeEl.setPointerCapture) badgeEl.setPointerCapture(e.pointerId);
    });

    badgeEl.addEventListener('pointermove', (e) => {
        if (!isDown) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dist = Math.hypot(dx, dy);

        if (dist > 8) hasMoved = true;
        if (!hasMoved) return;

        const clamp = (v, max) => Math.max(-max, Math.min(max, v));
        badgeEl.style.transform = `translate3d(${clamp(dx * 0.45, 24)}px, ${clamp(dy * 0.45, 24)}px, 0)`;

        badgeEl.classList.remove('swipe-left', 'swipe-right', 'swipe-up', 'swipe-down');
        currentDir = null;

        if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx <= -SWIPE_THRESHOLD) {
                currentDir = 'left';
                badgeEl.classList.add('swipe-left');
                overlayTag.innerText = '⬅ 出席';
            } else if (dx >= SWIPE_THRESHOLD) {
                currentDir = 'right';
                badgeEl.classList.add('swipe-right');
                overlayTag.innerText = '➡ 無故未到';
            }
        } else {
            if (dy <= -SWIPE_THRESHOLD) {
                currentDir = 'up';
                badgeEl.classList.add('swipe-up');
                overlayTag.innerText = '⬆ 請假';
            } else if (dy >= SWIPE_THRESHOLD) {
                currentDir = 'down';
                badgeEl.classList.add('swipe-down');
                overlayTag.innerText = '⬇ 部分出席';
            }
        }
    });

    const finishGesture = (e) => {
        if (!isDown) return;
        isDown = false;
        badgeEl.classList.remove('is-swiping', 'swipe-left', 'swipe-right', 'swipe-up', 'swipe-down');
        badgeEl.style.transform = '';
        if (badgeEl.releasePointerCapture && e.pointerId !== undefined) {
            try { badgeEl.releasePointerCapture(e.pointerId); } catch (_) {}
        }

        if (!hasMoved) {
            handleStudentCardClick(studentId);
            return;
        }

        const stu = draftStudents.find(s => String(s.id) === String(studentId));
        if (!stu || !currentDir) return;

        if (currentDir === 'left') {
            applyStudentDraft(studentId, { status: '出席', reason: '', timeIn: '', timeOut: '' });
            showToast(`✅ ${stu.id} ${stu.name} → 出席（已暫存）`);
        } else if (currentDir === 'right') {
            applyStudentDraft(studentId, { status: '無故缺席', reason: '', timeIn: '', timeOut: '' });
            showToast(`❌ ${stu.id} ${stu.name} → 無故未到（已暫存）`);
        } else if (currentDir === 'up') {
            openLeaveSheet(studentId);
        } else if (currentDir === 'down') {
            openPartialSheet(studentId);
        }
    };

    badgeEl.addEventListener('pointerup', finishGesture);
    badgeEl.addEventListener('pointercancel', finishGesture);
}

function applyStudentDraft(studentId, updates) {
    const stu = draftStudents.find(s => String(s.id) === String(studentId));
    if (!stu) return;
    Object.assign(stu, updates);
    refreshDirtyUI();
    renderGrid();
}

// ==================== 10. 上滑：假別挑選底部卡片 ====================
function openLeaveSheet(studentId) {
    const stu = draftStudents.find(s => String(s.id) === String(studentId));
    if (!stu) return;

    activeSheetStuId = studentId;
    document.getElementById('leaveSheetTitle').innerText = `登記請假：${stu.id}號 ${stu.name}`;
    document.getElementById('leaveNoteInput').value = stu.note || '';
    document.getElementById('leaveReasonInput').value = stu.reason || '';
    document.getElementById('leaveReasonWrap').style.display = 'none';
    document.getElementById('leaveConfirmWrap').style.display = 'none';

    document.querySelectorAll('.leave-type-card').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.leave === stu.status);
    });

    if (stu.status === '因故缺席') {
        document.getElementById('leaveReasonWrap').style.display = 'block';
        document.getElementById('leaveConfirmWrap').style.display = 'flex';
    }

    document.getElementById('leaveSheet').classList.add('open');
}

function selectLeaveType(leaveType) {
    if (!activeSheetStuId) return;
    const stu = draftStudents.find(s => String(s.id) === String(activeSheetStuId));
    if (!stu) return;

    document.querySelectorAll('.leave-type-card').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.leave === leaveType);
    });

    if (leaveType === '因故缺席') {
        document.getElementById('leaveReasonWrap').style.display = 'block';
        document.getElementById('leaveConfirmWrap').style.display = 'flex';
        document.getElementById('leaveReasonInput').focus();
        return;
    }

    const note = document.getElementById('leaveNoteInput').value.trim();
    applyStudentDraft(activeSheetStuId, {
        status: leaveType,
        reason: '',
        note: note,
        timeIn: '',
        timeOut: ''
    });
    closeLeaveSheet();
    showToast(`🟡 ${stu.id} ${stu.name} → ${leaveType}（已暫存）`);
}

function confirmReasonLeave() {
    if (!activeSheetStuId) return;
    const stu = draftStudents.find(s => String(s.id) === String(activeSheetStuId));
    if (!stu) return;

    const reason = document.getElementById('leaveReasonInput').value.trim();
    const note = document.getElementById('leaveNoteInput').value.trim();

    applyStudentDraft(activeSheetStuId, {
        status: '因故缺席',
        reason: reason,
        note: note,
        timeIn: '',
        timeOut: ''
    });
    closeLeaveSheet();
    showToast(`🟡 ${stu.id} ${stu.name} → 因故缺席（已暫存）`);
}

function closeLeaveSheet(ev) {
    if (ev && ev.target !== document.getElementById('leaveSheet')) return;
    document.getElementById('leaveSheet').classList.remove('open');
    activeSheetStuId = null;
}

// ==================== 11. 下滑：部分出席底部卡片 ====================
function openPartialSheet(studentId) {
    const stu = draftStudents.find(s => String(s.id) === String(studentId));
    if (!stu) return;

    activeSheetStuId = studentId;
    document.getElementById('partialSheetTitle').innerText = `部分出席：${stu.id}號 ${stu.name}`;
    document.getElementById('partialTimeIn').value = stu.timeIn || getCurrentTimeHHMM();
    document.getElementById('partialTimeOut').value = stu.timeOut || '';
    document.getElementById('partialNoteInput').value = stu.note || '';

    document.getElementById('partialSheet').classList.add('open');
}

function confirmPartialAttendance() {
    if (!activeSheetStuId) return;
    const stu = draftStudents.find(s => String(s.id) === String(activeSheetStuId));
    if (!stu) return;

    const timeIn = document.getElementById('partialTimeIn').value || '';
    const timeOut = document.getElementById('partialTimeOut').value || '';
    const note = document.getElementById('partialNoteInput').value.trim();

    if (!timeIn && !timeOut) {
        return alert("請至少填寫來課或離校時間！");
    }

    applyStudentDraft(activeSheetStuId, {
        status: '部分出席',
        reason: '',
        note: note,
        timeIn: timeIn,
        timeOut: timeOut
    });
    closePartialSheet();
    showToast(`🟣 ${stu.id} ${stu.name} → 部分出席 ${timeIn}（已暫存）`);
}

function closePartialSheet(ev) {
    if (ev && ev.target !== document.getElementById('partialSheet')) return;
    document.getElementById('partialSheet').classList.remove('open');
    activeSheetStuId = null;
}

// ==================== 12. 講台左「全到」＆ 講台右「送出點名」 ====================
function markAllPresent() {
    const className = document.getElementById('classSelect').value;
    if (!className) return alert("請先選擇班級！");
    if (draftStudents.length === 0) return alert("本班目前沒有學生資料！");

    const unmarked = draftStudents.filter(s => s.status === "未點名");

    if (unmarked.length > 0) {
        unmarked.forEach(s => {
            s.status = "出席";
            s.reason = "";
            s.timeIn = "";
            s.timeOut = "";
        });
        refreshDirtyUI();
        renderGrid();
        showToast(`✅ 已將 ${unmarked.length} 位未點名學生標記為出席（請按「送出點名」儲存）`);
    } else {
        if (!confirm("本班所有學生皆已標記狀態，確定要將全班重設為「出席」嗎？")) return;
        draftStudents.forEach(s => {
            s.status = "出席";
            s.reason = "";
            s.timeIn = "";
            s.timeOut = "";
        });
        refreshDirtyUI();
        renderGrid();
        showToast(`✅ 已將全班 ${draftStudents.length} 人設為出席（請按「送出點名」儲存）`);
    }
}

async function submitAttendance() {
    const className = document.getElementById('classSelect').value;
    const date = dateInput.value;
    if (!className) return alert("請先選擇班級！");
    if (draftStudents.length === 0) return alert("本班目前沒有學生資料！");

    const modifiedList = getModifiedStudents();
    if (modifiedList.length === 0) {
        showToast("目前沒有需要送出的變更");
        return;
    }

    const submitBtn = document.getElementById('btnSubmitAttendance');
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ 送出中...';

    const nowTs = Date.now();
    const teacherName = currentTeacherName || document.getElementById('navUserName')?.innerText || '老師';

    try {
        const changedLogs = modifiedList.map(stu => {
            const orig = originalStudentsMap[String(stu.id)] || {};
            const oldStatus = orig.status || "未點名";

            if (stu.status === "未點名") {
                stu.updatedBy = "";
                stu.updatedAt = 0;
            } else {
                stu.updatedBy = teacherName;
                stu.updatedAt = nowTs;
            }

            let detail = `將 [${date}] ${className} ${stu.id}號 ${stu.name} 從「${oldStatus}」改為「${stu.status}」`;
            if (stu.status === '部分出席' && (stu.timeIn || stu.timeOut)) {
                detail += ` (${stu.timeIn}~${stu.timeOut})`;
            }
            if (stu.reason) detail += ` (原因:${stu.reason})`;
            if (stu.note) detail += ` (備註:${stu.note})`;
            return detail;
        });

        await window.db.ref(`attendance_${date}/${currentCategory}/${className}`).set(draftStudents);
        await window.db.ref(`attendance_meta/${date}/${currentCategory}/${className}`).set(nowTs);

        if (typeof logActivity === 'function' && changedLogs.length > 0) {
            await Promise.all(changedLogs.map(detail => logActivity('點名紀錄', detail)));
        }

        originalStudentsMap = {};
        draftStudents.forEach(s => {
            originalStudentsMap[String(s.id)] = { ...s };
        });

        hasUnsavedChanges = false;
        refreshDirtyUI();
        renderGrid();
        document.getElementById('lastUpdate').innerText = `已送出：${new Date().toLocaleTimeString()}`;
        showToast(`💾 雲端同步成功！已更新 ${modifiedList.length} 筆點名資料`);
    } catch (err) {
        console.error("送出點名失敗：", err);
        alert("送出失敗，請檢查網路連線！");
        refreshDirtyUI();
    } finally {
        submitBtn.disabled = false;
    }
}

// ==================== 13. 調整座位模式：拖曳互換座位 ====================
let draggedId = null;

function allowDrop(ev) {
    if (interactionMode !== 'seat') return;
    ev.preventDefault();
}

function drag(ev, id) {
    if (interactionMode !== 'seat') return;
    draggedId = String(id);
    ev.dataTransfer.setData("text/plain", draggedId);
    ev.stopPropagation();
}

async function drop(ev, slotIndex) {
    if (interactionMode !== 'seat') return;
    ev.preventDefault();
    const targetSlot = ev.target.closest('.seat-slot');
    if (!targetSlot || !draggedId) return;

    const className = document.getElementById('classSelect').value;
    const date = dateInput.value;

    const draggedStu = draftStudents.find(s => String(s.id) === draggedId);
    if (!draggedStu) return;

    const oldPos = draggedStu.pos;
    if (oldPos === slotIndex) return;

    const occupantStu = draftStudents.find(s => s.pos === slotIndex);

    draggedStu.pos = slotIndex;
    if (occupantStu) {
        occupantStu.pos = oldPos;
    }

    let tSnap = await window.db.ref('rosterTemplate').once('value');
    let template = tSnap.val();
    if (template && template[currentCategory] && template[currentCategory][className]) {
        const tList = template[currentCategory][className];
        draftStudents.forEach(dStu => {
            const tStu = tList.find(s => String(s.id) === String(dStu.id));
            if (tStu) tStu.pos = dStu.pos;
        });
        await window.db.ref('rosterTemplate').set(template);
    }

    await window.db.ref(`attendance_${date}/${currentCategory}/${className}`).set(draftStudents);

    if (typeof logActivity === 'function') {
        const detail = occupantStu
            ? `將 ${className} ${draggedStu.name} 與 ${occupantStu.name} 互換座位`
            : `將 ${className} ${draggedStu.name} 的座位調整至第 ${slotIndex + 1} 格`;
        await logActivity('座位調整', detail);
    }

    draggedId = null;
    showToast("🪑 座位已更新並儲存");
}

// ==================== 14. 輕點卡片：完整狀態修改 Modal ====================
function openModal(stuId) {
    const student = draftStudents.find(s => String(s.id) === String(stuId));
    if (!student) return;

    currentEditStuId = stuId;
    document.getElementById('statusModal').style.display = 'flex';
    document.getElementById('modalStuName').innerText = `修改 ${student.id}號 ${student.name} 的狀態`;
    document.getElementById('modalStatusSelect').value = student.status;
    document.getElementById('modalReason').value = student.reason || '';
    document.getElementById('modalNote').value = student.note || '';
    document.getElementById('modalTimeIn').value = student.timeIn || '';
    document.getElementById('modalTimeOut').value = student.timeOut || '';

    updateModalFields(student.status);
}

document.getElementById('modalStatusSelect').addEventListener('change', function () {
    updateModalFields(this.value);
});

function updateModalFields(status) {
    document.getElementById('modalReason').style.display = status === '因故缺席' ? 'block' : 'none';
    document.getElementById('modalTimeGroup').style.display = status === '部分出席' ? 'flex' : 'none';
}

function closeModal() {
    document.getElementById('statusModal').style.display = 'none';
    currentEditStuId = null;
}

function saveTeacherStatus() {
    if (!currentEditStuId) return;
    const stu = draftStudents.find(s => String(s.id) === String(currentEditStuId));
    if (!stu) return;

    const newStatus = document.getElementById('modalStatusSelect').value;
    const newReason = newStatus === '因故缺席' ? (document.getElementById('modalReason').value.trim()) : '';
    const newNote = document.getElementById('modalNote').value.trim();
    const newTimeIn = newStatus === '部分出席' ? (document.getElementById('modalTimeIn').value || '') : '';
    const newTimeOut = newStatus === '部分出席' ? (document.getElementById('modalTimeOut').value || '') : '';

    applyStudentDraft(currentEditStuId, {
        status: newStatus,
        reason: newReason,
        note: newNote,
        timeIn: newTimeIn,
        timeOut: newTimeOut
    });

    closeModal();
    showToast(`已暫存 ${stu.name} → ${newStatus}（記得按「送出點名」）`);
}

initSystem();