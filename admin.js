const DEFAULT_CATEGORIES = [
    '周間普通班', '周間分組班(數)', '周間分組班(英)', '周間分組班(自)',
    '周間晚自習', '週六假日班', '週六資優班', '校隊', '社團'
];

const DEFAULT_SCHEDULE = {
    weekday: [
        { id: 'p1', name: '第 1 節', start: '08:15', end: '09:00' },
        { id: 'p2', name: '第 2 節', start: '09:10', end: '09:55' },
        { id: 'p3', name: '第 3 節', start: '10:10', end: '10:55' },
        { id: 'p4', name: '第 4 節', start: '11:05', end: '11:50' },
        { id: 'p5', name: '第 5 節', start: '13:15', end: '14:00' },
        { id: 'p6', name: '第 6 節', start: '14:10', end: '14:55' },
        { id: 'p7', name: '第 7 節', start: '15:10', end: '15:55' },
        { id: 'p8', name: '第 8 節', start: '16:05', end: '16:50' },
        { id: 'p_evening', name: '晚自習', start: '18:00', end: '20:30' }
    ],
    weekend: [
        { id: 'w1', name: '第 1 節', start: '08:30', end: '09:50' },
        { id: 'w2', name: '第 2 節', start: '10:10', end: '11:30' },
        { id: 'w3', name: '第 3 節', start: '13:30', end: '14:50' },
        { id: 'w4', name: '第 4 節', start: '15:10', end: '16:30' }
    ]
};

const chart = document.getElementById('seatingChart');
const dateInput = document.getElementById('adminDateSelect');

let currentTeacherName = "";
let scheduleConfig = { weekday: DEFAULT_SCHEDULE.weekday, weekend: DEFAULT_SCHEDULE.weekend };
let currentCategory = "";
let lastSelectedCategory = "";
let lastSelectedClass = "";
let lastSelectedDate = "";
let lastSelectedPeriod = "";
let interactionMode = 'swipe';

let periodListenerRef = null;
let originalStudentsMap = {};
let draftStudents = [];
let hasUnsavedChanges = false;

let otherClassNoticesByKey = {};
let dismissedNoticeSigs = {};
let activeNoticeStu = null;

let activeSheetStuId = null;
let currentEditStuId = null;
let toastTimer = null;

function getLocalTodayDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

function formatChineseDateWithWeekday(dateStr) {
    if (!dateStr) return '選擇日期';
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return `${d.getMonth() + 1}月${d.getDate()}日 星期${days[d.getDay()]}`;
}

function updateDateDisplay() {
    const el = document.getElementById('dateDisplayText');
    if (el) el.innerText = formatChineseDateWithWeekday(dateInput.value);
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

// ==================== 1. 課表節次工具 ====================
async function loadScheduleConfig() {
    try {
        const snap = await window.db.ref('scheduleConfig').once('value');
        const val = snap.val();
        if (val) {
            scheduleConfig.weekday = Array.isArray(val.weekday) && val.weekday.length > 0 ? val.weekday.filter(Boolean) : DEFAULT_SCHEDULE.weekday;
            scheduleConfig.weekend = Array.isArray(val.weekend) && val.weekend.length > 0 ? val.weekend.filter(Boolean) : DEFAULT_SCHEDULE.weekend;
        }
    } catch (err) {
        console.error("讀取課表失敗，改用預設節次：", err);
    }
}

function getPeriodsForDate(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    const day = isNaN(d.getTime()) ? new Date().getDay() : d.getDay();
    return (day === 0 || day === 6) ? scheduleConfig.weekend : scheduleConfig.weekday;
}

function getAutoPeriodId(periods) {
    if (!periods || periods.length === 0) return '';
    const nowHHMM = getCurrentTimeHHMM();
    const current = periods.find(p => p.start && p.end && nowHHMM >= p.start && nowHHMM <= p.end);
    if (current) return current.id;
    const upcoming = periods.find(p => p.start && nowHHMM < p.start);
    if (upcoming) return upcoming.id;
    return periods[periods.length - 1].id;
}

function populatePeriodSelect(dateStr, preferredPeriodId = null) {
    const periods = getPeriodsForDate(dateStr);
    const sel = document.getElementById('adminPeriodSelect');
    if (!sel) return;

    sel.innerHTML = periods.map(p =>
        `<option value="${p.id}">${p.name} (${p.start}~${p.end})</option>`
    ).join('');

    if (preferredPeriodId && periods.some(p => p.id === preferredPeriodId)) {
        sel.value = preferredPeriodId;
    } else {
        sel.value = getAutoPeriodId(periods);
    }
    lastSelectedPeriod = sel.value;
}

function getCurrentPeriodName() {
    const periods = getPeriodsForDate(dateInput.value);
    const p = periods.find(item => item.id === document.getElementById('adminPeriodSelect').value);
    return p ? p.name : document.getElementById('adminPeriodSelect').value;
}

// ==================== 2. 同節課跨班連動邏輯 ====================
function getStudentMatchKeys(stu, category, className) {
    const keys = [];
    if (stu.studentNumber) keys.push(`num:${String(stu.studentNumber).trim()}`);
    const hr = (category === '周間普通班') ? className : (stu.originalClass || '');
    if (hr && stu.name) keys.push(`hr:${String(hr).trim()}_${String(stu.name).trim()}`);
    if (keys.length === 0 && stu.name) keys.push(`name:${String(stu.name).trim()}`);
    return keys;
}

function rebuildCrossClassNotices(periodData, curCat, curCls) {
    const map = {};
    if (!periodData) {
        otherClassNoticesByKey = {};
        return;
    }
    for (const cat in periodData) {
        if (!periodData[cat]) continue;
        for (const cls in periodData[cat]) {
            if (cat === curCat && cls === curCls) continue;
            const list = periodData[cat][cls];
            if (!Array.isArray(list)) continue;

            list.forEach(s => {
                if (!s || s.id === '_placeholder' || !s.status || s.status === '未點名' || s.isAutoSynced) return;
                const record = {
                    category: cat,
                    className: cls,
                    status: s.status,
                    reason: s.reason || '',
                    note: s.note || '',
                    timeIn: s.timeIn || '',
                    timeOut: s.timeOut || '',
                    updatedBy: s.updatedBy || '',
                    updatedAt: s.updatedAt || 0
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
    const className = document.getElementById('adminClassSelect').value || lastSelectedClass || '';
    const keys = getStudentMatchKeys(stu, currentCategory, className);
    const seen = new Set();
    const results = [];

    keys.forEach(k => {
        (otherClassNoticesByKey[k] || []).forEach(rec => {
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

function getEffectiveStudentView(stu) {
    const notices = getCrossClassNotices(stu);
    if (stu.status === '未點名' && notices.length > 0) {
        const latest = notices[0];
        const teacherStr = latest.updatedBy ? `${latest.updatedBy} 老師` : '其他老師';
        const timeStr = latest.updatedAt ? formatHHMM(latest.updatedAt) : '本節稍早';

        if (latest.status === '出席' || latest.status === '部分出席') {
            return {
                status: '事假',
                reason: '參與其他課程',
                note: stu.note || '',
                isAutoCross: true,
                crossSummary: `本節課已被 ${teacherStr} 於 ${timeStr} 點名`,
                latestNotice: latest
            };
        } else if (['病假', '喪假', '事假', '因故缺席'].includes(latest.status)) {
            return {
                status: latest.status,
                reason: latest.reason || '',
                note: stu.note || '',
                isAutoCross: true,
                crossSummary: `本節課已被 ${teacherStr} 於 ${timeStr} 點名為 ${latest.status}`,
                latestNotice: latest
            };
        }
    }
    return {
        status: stu.status || '未點名',
        reason: stu.reason || '',
        note: stu.note || '',
        isAutoCross: false,
        crossSummary: '',
        latestNotice: notices[0] || null
    };
}

function getNoticeSignature(notices) {
    return notices
        .map(n => `${n.category}|${n.className}|${n.status}|${n.updatedAt}|${n.reason}`)
        .join(';;');
}

function getNoticeReadKey(stuId) {
    const cls = document.getElementById('adminClassSelect').value || lastSelectedClass || '';
    const pid = document.getElementById('adminPeriodSelect').value || lastSelectedPeriod || '';
    return `${dateInput.value}_${pid}_${currentCategory}_${cls}_${stuId}`;
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
        if (dot) dot.style.display = hasUnreadCrossNotice(stu) ? 'block' : 'none';
    });
}

function openCrossNoticeModal(stu) {
    const notices = getCrossClassNotices(stu);
    if (notices.length === 0) return;

    activeNoticeStu = stu;
    document.getElementById('crossNoticeTitle').innerText = `${stu.id}號 ${stu.name} — ${getCurrentPeriodName()}他班紀錄`;

    const listEl = document.getElementById('crossNoticeList');
    listEl.innerHTML = notices.map(rec => {
        const timeStr = rec.updatedAt ? formatHHMM(rec.updatedAt) : '本節稍早';
        const teacherStr = rec.updatedBy ? `${rec.updatedBy} 老師` : '其他老師';
        const autoTip = (rec.status === '出席' || rec.status === '部分出席')
            ? '本班已自動標示為「事假（參與其他課程）」'
            : `本班已自動同步顯示為「${rec.status}」`;

        let extraParts = [autoTip];
        if (rec.reason) extraParts.push(`原因：${rec.reason}`);
        if (rec.note) extraParts.push(`備註：${rec.note}`);

        return `
            <div class="notice-item">
                本節課已被 <strong>${teacherStr}</strong> 於 <strong>${timeStr}</strong> 在【${rec.category} - ${rec.className}】點名為 <span class="notice-status-pill">${rec.status}</span>
                <span class="notice-extra">${extraParts.join(' ｜ ')}</span>
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

// ==================== 3. 提示與防呆工具 ====================
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
        submitBtn.innerText = hasUnsavedChanges ? `💾 送出點名 (${modifiedCount})` : '💾 送出點名';
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

// ==================== 4. 動態載入班種與初始化 ====================
async function loadAdminCategories() {
    const grid = document.getElementById('adminCategoryGrid');
    const catSel = document.getElementById('adminCategorySelect');

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

    if (grid) {
        grid.innerHTML = '';
        list.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'btn-category';
            btn.textContent = cat;
            btn.addEventListener('click', () => selectAdminCategory(cat));
            grid.appendChild(btn);
        });
    }
    if (catSel) {
        catSel.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

async function initAdminPage() {
    const today = getLocalTodayDate();
    dateInput.value = today;
    lastSelectedDate = today;
    updateDateDisplay();

    await Promise.all([loadAdminCategories(), loadScheduleConfig()]);
    populatePeriodSelect(today);

    // 檢查是否從「點名資料查詢」帶參數跳轉
    const urlParams = new URLSearchParams(window.location.search);
    const qDate = urlParams.get('date');
    const qPeriod = urlParams.get('period');
    const qCat = urlParams.get('category');
    const qClass = urlParams.get('class');

    if (qDate && qCat && qClass) {
        dateInput.value = qDate;
        lastSelectedDate = qDate;
        updateDateDisplay();
        populatePeriodSelect(qDate, qPeriod);

        currentCategory = qCat;
        lastSelectedCategory = qCat;
        document.getElementById('adminCategorySelect').value = qCat;
        document.getElementById('step1').style.display = 'none';
        document.getElementById('step2').style.display = 'block';

        await loadAdminClasses();
        document.getElementById('adminClassSelect').value = qClass;
        lastSelectedClass = qClass;
        loadSeatingChart();
    }
}

async function selectAdminCategory(category) {
    currentCategory = category;
    lastSelectedCategory = category;
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
    document.getElementById('adminCategorySelect').value = category;
    updateDateDisplay();
    populatePeriodSelect(dateInput.value);
    await loadAdminClasses();
}

function goBack() {
    if (!confirmLeaveIfDirty()) return;
    hasUnsavedChanges = false;
    draftStudents = [];
    originalStudentsMap = {};
    otherClassNoticesByKey = {};
    lastSelectedClass = "";
    refreshDirtyUI();

    document.getElementById('step1').style.display = 'block';
    document.getElementById('step2').style.display = 'none';
    currentCategory = "";
    if (periodListenerRef) periodListenerRef.off();
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

async function loadAdminClasses() {
    let snap = await window.db.ref('rosterTemplate').once('value');
    let template = snap.val() || {};

    const classSelect = document.getElementById('adminClassSelect');
    classSelect.innerHTML = '<option value="">請選擇班級...</option>';

    if (template[currentCategory]) {
        Object.keys(template[currentCategory])
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .forEach(cls => {
                classSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
            });
    }
    lastSelectedClass = "";
    draftStudents = [];
    originalStudentsMap = {};
    otherClassNoticesByKey = {};
    refreshDirtyUI();
    initGrid();
}

async function handleSentenceChange(source) {
    const catSel = document.getElementById('adminCategorySelect');
    const clsSel = document.getElementById('adminClassSelect');
    const perSel = document.getElementById('adminPeriodSelect');

    if (hasUnsavedChanges) {
        if (!confirm("目前尚有未送出的點名資料，切換將會遺失暫存變更，確定要繼續嗎？")) {
            if (source === 'category') catSel.value = lastSelectedCategory;
            if (source === 'class') clsSel.value = lastSelectedClass;
            if (source === 'date') dateInput.value = lastSelectedDate;
            if (source === 'period') perSel.value = lastSelectedPeriod;
            updateDateDisplay();
            return;
        }
    }

    hasUnsavedChanges = false;

    if (source === 'category') {
        currentCategory = catSel.value;
        lastSelectedCategory = catSel.value;
        if (periodListenerRef) periodListenerRef.off();
        await loadAdminClasses();
        return;
    }

    if (source === 'date') {
        lastSelectedDate = dateInput.value;
        updateDateDisplay();
        populatePeriodSelect(dateInput.value);
    }

    if (source === 'period') lastSelectedPeriod = perSel.value;
    if (source === 'class') lastSelectedClass = clsSel.value;

    loadSeatingChart();
}

// ==================== 5. 讀取與監聽「指定日期＋節次」資料 ====================
function loadSeatingChart() {
    const className = document.getElementById('adminClassSelect').value;
    const date = dateInput.value;
    const periodId = document.getElementById('adminPeriodSelect').value;

    if (periodListenerRef) periodListenerRef.off();

    if (!className || !periodId) {
        draftStudents = [];
        originalStudentsMap = {};
        otherClassNoticesByKey = {};
        refreshDirtyUI();
        initGrid();
        return;
    }

    lastSelectedClass = className;
    lastSelectedDate = date;
    lastSelectedPeriod = periodId;

    periodListenerRef = window.db.ref(`attendance_${date}/${periodId}`);
    periodListenerRef.on('value', async (snap) => {
        let periodData = snap.val() || {};

        let rawList = periodData[currentCategory]?.[className];
        if (!rawList) {
            const tSnap = await window.db.ref(`rosterTemplate/${currentCategory}/${className}`).once('value');
            const tplList = tSnap.val() || [];
            rawList = tplList
                .filter(s => s && s.id !== "_placeholder")
                .map(s => ({ ...s, status: "未點名", reason: "", note: "", timeIn: "", timeOut: "" }));
        }

        rebuildCrossClassNotices(periodData, currentCategory, className);

        if (hasUnsavedChanges) {
            updateNoticeDotsOnly();
            document.getElementById('lastUpdate').innerText = `雲端有更新（本地編輯中）`;
            return;
        }

        const validList = Array.isArray(rawList) ? rawList.filter(s => s && s.id !== "_placeholder") : [];
        draftStudents = validList.map(s => ({
            ...s,
            status: s.status || "未點名",
            reason: s.reason || "",
            note: s.note || "",
            timeIn: s.timeIn || "",
            timeOut: s.timeOut || ""
        }));

        originalStudentsMap = {};
        draftStudents.forEach(s => { originalStudentsMap[String(s.id)] = { ...s }; });

        refreshDirtyUI();
        renderGrid();
        document.getElementById('lastUpdate').innerText = `最後同步：${new Date().toLocaleTimeString()}`;
    });
}

// ==================== 6. 繪製 6×6 座位表與綁定手勢 ====================
function renderGrid() {
    initGrid();
    if (!draftStudents || draftStudents.length === 0) return;

    draftStudents.forEach(student => {
        const view = getEffectiveStudentView(student);

        let glowClass = "no-glow";
        if (view.status === "出席") glowClass = "glow-green";
        else if (view.status === "無故缺席") glowClass = "glow-red";
        else if (view.status === "部分出席") glowClass = "glow-purple";
        else if (["病假", "喪假", "事假", "因故缺席"].includes(view.status)) glowClass = "glow-yellow";

        const dirtyClass = isStudentModified(student) ? "is-dirty" : "";
        const showRedDot = hasUnreadCrossNotice(student);

        let extraInfo = "";
        if (view.isAutoCross && view.crossSummary) {
            extraInfo = `<div class="stu-cross-tag" title="${view.crossSummary}">${view.crossSummary}</div>`;
        } else if (view.status === "部分出席" && (student.timeIn || student.timeOut)) {
            extraInfo = `<div class="stu-note">🕒 ${student.timeIn || '--:--'}~${student.timeOut || ''}</div>`;
        } else if (view.note) {
            extraInfo = `<div class="stu-note">📝${view.note}</div>`;
        }

        const origClassBadge = (currentCategory !== '周間普通班' && student.originalClass)
            ? `<div style="font-size:10px; color:white; background:#8e44ad; border-radius:3px; padding:1px 5px; margin-bottom:2px; display:inline-block;">${student.originalClass}</div>` : "";

        const badge = document.createElement('div');
        badge.className = `student-badge ${glowClass} ${dirtyClass}`;
        badge.id = `stu_${student.id}`;
        badge.innerHTML = `
            <span class="cross-notice-dot" style="display:${showRedDot ? 'block' : 'none'};" title="本節課在他班有點名紀錄"></span>
            ${origClassBadge}
            <span class="stu-name">${student.id} ${student.name}</span>
            <span class="stu-status">${view.status}</span>
            ${view.reason ? `<span class="stu-reason">(${view.reason})</span>` : ''}
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

// ==================== 7. 四向滑動手勢引擎 ====================
function bindSwipeEvents(badgeEl, studentId) {
    const SWIPE_THRESHOLD = 30;
    const overlayTag = badgeEl.querySelector('.swipe-overlay-tag');

    let isDown = false, hasMoved = false, startX = 0, startY = 0, currentDir = null;

    badgeEl.addEventListener('pointerdown', (e) => {
        if (interactionMode !== 'swipe') return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        isDown = true; hasMoved = false; currentDir = null;
        startX = e.clientX; startY = e.clientY;
        badgeEl.classList.add('is-swiping');
        if (badgeEl.setPointerCapture) badgeEl.setPointerCapture(e.pointerId);
    });

    badgeEl.addEventListener('pointermove', (e) => {
        if (!isDown) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (Math.hypot(dx, dy) > 8) hasMoved = true;
        if (!hasMoved) return;

        const clamp = (v, max) => Math.max(-max, Math.min(max, v));
        badgeEl.style.transform = `translate3d(${clamp(dx * 0.45, 24)}px, ${clamp(dy * 0.45, 24)}px, 0)`;
        badgeEl.classList.remove('swipe-left', 'swipe-right', 'swipe-up', 'swipe-down');
        currentDir = null;

        if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx <= -SWIPE_THRESHOLD) { currentDir = 'left'; badgeEl.classList.add('swipe-left'); overlayTag.innerText = '⬅ 出席'; }
            else if (dx >= SWIPE_THRESHOLD) { currentDir = 'right'; badgeEl.classList.add('swipe-right'); overlayTag.innerText = '➡ 無故未到'; }
        } else {
            if (dy <= -SWIPE_THRESHOLD) { currentDir = 'up'; badgeEl.classList.add('swipe-up'); overlayTag.innerText = '⬆ 請假'; }
            else if (dy >= SWIPE_THRESHOLD) { currentDir = 'down'; badgeEl.classList.add('swipe-down'); overlayTag.innerText = '⬇ 部分出席'; }
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

        if (!hasMoved) { handleStudentCardClick(studentId); return; }

        const stu = draftStudents.find(s => String(s.id) === String(studentId));
        if (!stu || !currentDir) return;

        if (currentDir === 'left') {
            applyStudentDraft(studentId, { status: '出席', reason: '', timeIn: '', timeOut: '', isAutoSynced: false });
            showToast(`✅ ${stu.id} ${stu.name} → 出席（已暫存）`);
        } else if (currentDir === 'right') {
            applyStudentDraft(studentId, { status: '無故缺席', reason: '', timeIn: '', timeOut: '', isAutoSynced: false });
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

// ==================== 8. 底部請假／部分出席卡片 ====================
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

    applyStudentDraft(activeSheetStuId, {
        status: leaveType,
        reason: '',
        note: document.getElementById('leaveNoteInput').value.trim(),
        timeIn: '',
        timeOut: '',
        isAutoSynced: false
    });
    closeLeaveSheet();
    showToast(`🟡 ${stu.id} ${stu.name} → ${leaveType}（已暫存）`);
}

function confirmReasonLeave() {
    if (!activeSheetStuId) return;
    const stu = draftStudents.find(s => String(s.id) === String(activeSheetStuId));
    if (!stu) return;

    applyStudentDraft(activeSheetStuId, {
        status: '因故缺席',
        reason: document.getElementById('leaveReasonInput').value.trim(),
        note: document.getElementById('leaveNoteInput').value.trim(),
        timeIn: '',
        timeOut: '',
        isAutoSynced: false
    });
    closeLeaveSheet();
    showToast(`🟡 ${stu.id} ${stu.name} → 因故缺席（已暫存）`);
}

function closeLeaveSheet(ev) {
    if (ev && ev.target !== document.getElementById('leaveSheet')) return;
    document.getElementById('leaveSheet').classList.remove('open');
    activeSheetStuId = null;
}

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
    if (!timeIn && !timeOut) return alert("請至少填寫來課或離校時間！");

    applyStudentDraft(activeSheetStuId, {
        status: '部分出席',
        reason: '',
        note: document.getElementById('partialNoteInput').value.trim(),
        timeIn,
        timeOut,
        isAutoSynced: false
    });
    closePartialSheet();
    showToast(`🟣 ${stu.id} ${stu.name} → 部分出席 ${timeIn}（已暫存）`);
}

function closePartialSheet(ev) {
    if (ev && ev.target !== document.getElementById('partialSheet')) return;
    document.getElementById('partialSheet').classList.remove('open');
    activeSheetStuId = null;
}

// ==================== 9. 講台左「全到」＆ 講台右「送出點名」 ====================
function markAllPresent() {
    const className = document.getElementById('adminClassSelect').value;
    if (!className) return alert("請先選擇班級！");
    if (draftStudents.length === 0) return alert("本班目前沒有學生資料！");

    const unmarked = draftStudents.filter(s => getEffectiveStudentView(s).status === "未點名");

    if (unmarked.length > 0) {
        unmarked.forEach(s => {
            s.status = "出席";
            s.reason = "";
            s.timeIn = "";
            s.timeOut = "";
            s.isAutoSynced = false;
        });
        refreshDirtyUI();
        renderGrid();
        showToast(`✅ 已將 ${unmarked.length} 位未點名學生標記為出席（請按「送出點名」儲存）`);
    } else {
        if (!confirm("本班所有學生皆已標記狀態（或已於他班點名），確定要將全班重設為「出席」嗎？")) return;
        draftStudents.forEach(s => {
            s.status = "出席";
            s.reason = "";
            s.timeIn = "";
            s.timeOut = "";
            s.isAutoSynced = false;
        });
        refreshDirtyUI();
        renderGrid();
        showToast(`✅ 已將全班 ${draftStudents.length} 人設為出席（請按「送出點名」儲存）`);
    }
}

async function submitAdminAttendance() {
    const className = document.getElementById('adminClassSelect').value;
    const date = dateInput.value;
    const periodId = document.getElementById('adminPeriodSelect').value;
    const periodName = getCurrentPeriodName();
    if (!className || !periodId) return alert("請先選擇班級與節次！");
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
                stu.isAutoSynced = false;
            }

            let detail = `將 [${date} ${periodName}] ${className} ${stu.id}號 ${stu.name} 從「${oldStatus}」改為「${stu.status}」`;
            if (stu.status === '部分出席' && (stu.timeIn || stu.timeOut)) detail += ` (${stu.timeIn}~${stu.timeOut})`;
            if (stu.reason) detail += ` (原因:${stu.reason})`;
            if (stu.note) detail += ` (備註:${stu.note})`;
            return detail;
        });

        await window.db.ref(`attendance_${date}/${periodId}/${currentCategory}/${className}`).set(draftStudents);
        await window.db.ref(`attendance_meta/${date}/${periodId}/${currentCategory}/${className}`).set({
            updatedAt: nowTs,
            periodName: periodName
        });

        if (typeof logActivity === 'function' && changedLogs.length > 0) {
            await Promise.all(changedLogs.map(detail => logActivity('點名紀錄', detail)));
        }

        originalStudentsMap = {};
        draftStudents.forEach(s => { originalStudentsMap[String(s.id)] = { ...s }; });

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

// ==================== 10. 調整座位模式：拖曳互換座位 ====================
let draggedId = null;
function allowDrop(ev) { if (interactionMode === 'seat') ev.preventDefault(); }
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

    const className = document.getElementById('adminClassSelect').value;
    const date = dateInput.value;
    const periodId = document.getElementById('adminPeriodSelect').value;

    const draggedStu = draftStudents.find(s => String(s.id) === draggedId);
    if (!draggedStu || draggedStu.pos === slotIndex) return;

    const oldPos = draggedStu.pos;
    const occupantStu = draftStudents.find(s => s.pos === slotIndex);
    draggedStu.pos = slotIndex;
    if (occupantStu) occupantStu.pos = oldPos;

    let tSnap = await window.db.ref('rosterTemplate').once('value');
    let template = tSnap.val();
    if (template?.[currentCategory]?.[className]) {
        const tList = template[currentCategory][className];
        draftStudents.forEach(dStu => {
            const tStu = tList.find(s => String(s.id) === String(dStu.id));
            if (tStu) tStu.pos = dStu.pos;
        });
        await window.db.ref('rosterTemplate').set(template);
    }

    await window.db.ref(`attendance_${date}/${periodId}/${currentCategory}/${className}`).set(draftStudents);

    if (typeof logActivity === 'function') {
        const detail = occupantStu
            ? `將 ${className} ${draggedStu.name} 與 ${occupantStu.name} 互換座位`
            : `將 ${className} ${draggedStu.name} 的座位調整至第 ${slotIndex + 1} 格`;
        await logActivity('座位調整', detail);
    }
    draggedId = null;
    showToast("🪑 座位已更新並儲存");
}

// ==================== 11. 輕點卡片：完整狀態修改 Modal ====================
function openModal(stuId) {
    const student = draftStudents.find(s => String(s.id) === String(stuId));
    if (!student) return;

    currentEditStuId = stuId;
    const view = getEffectiveStudentView(student);
    document.getElementById('statusModal').style.display = 'flex';
    document.getElementById('modalStuName').innerText = `修改 ${student.id}號 ${student.name} 的狀態`;
    document.getElementById('modalStatusSelect').value = view.status;
    document.getElementById('modalReason').value = view.reason || '';
    document.getElementById('modalNote').value = student.note || '';
    document.getElementById('modalTimeIn').value = student.timeIn || '';
    document.getElementById('modalTimeOut').value = student.timeOut || '';

    updateModalFields(view.status);
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

function saveAdminStatus() {
    if (!currentEditStuId) return;
    const stu = draftStudents.find(s => String(s.id) === String(currentEditStuId));
    if (!stu) return;

    const newStatus = document.getElementById('modalStatusSelect').value;
    applyStudentDraft(currentEditStuId, {
        status: newStatus,
        reason: newStatus === '因故缺席' ? document.getElementById('modalReason').value.trim() : '',
        note: document.getElementById('modalNote').value.trim(),
        timeIn: newStatus === '部分出席' ? (document.getElementById('modalTimeIn').value || '') : '',
        timeOut: newStatus === '部分出席' ? (document.getElementById('modalTimeOut').value || '') : '',
        isAutoSynced: false
    });

    closeModal();
    showToast(`已暫存 ${stu.name} → ${newStatus}（記得按「送出點名」）`);
}

initAdminPage();