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

let scheduleData = {
    weekday: [],
    weekend: []
};
let currentTab = 'weekday';

function cloneDefault(type) {
    return DEFAULT_SCHEDULE[type].map(p => ({ ...p }));
}

async function loadScheduleConfig() {
    try {
        const snap = await window.db.ref('scheduleConfig').once('value');
        const val = snap.val();

        if (!val) {
            scheduleData = {
                weekday: cloneDefault('weekday'),
                weekend: cloneDefault('weekend')
            };
            await window.db.ref('scheduleConfig').set(scheduleData);
        } else {
            scheduleData.weekday = Array.isArray(val.weekday) && val.weekday.length > 0
                ? val.weekday.filter(Boolean)
                : cloneDefault('weekday');
            scheduleData.weekend = Array.isArray(val.weekend) && val.weekend.length > 0
                ? val.weekend.filter(Boolean)
                : cloneDefault('weekend');
        }
        renderScheduleTable();
    } catch (err) {
        console.error("讀取課表失敗：", err);
        alert("無法讀取課表設定，請檢查網路連線！");
    }
}

function syncInputsToState() {
    const rows = document.querySelectorAll('#scheduleTableBody tr[data-index]');
    const list = scheduleData[currentTab];
    rows.forEach(row => {
        const idx = Number(row.dataset.index);
        if (!list[idx]) return;
        list[idx].name = row.querySelector('.schedule-input-name').value.trim();
        list[idx].start = row.querySelector('.input-start').value;
        list[idx].end = row.querySelector('.input-end').value;
    });
}

function switchScheduleTab(tab) {
    syncInputsToState();
    currentTab = tab;
    document.getElementById('tabWeekday').classList.toggle('active', tab === 'weekday');
    document.getElementById('tabWeekend').classList.toggle('active', tab === 'weekend');
    renderScheduleTable();
}

function renderScheduleTable() {
    const tbody = document.getElementById('scheduleTableBody');
    const list = scheduleData[currentTab];

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#aeb9b6; padding:24px;">目前尚無節次，請點擊上方「➕ 新增一節課」</td></tr>';
        return;
    }

    tbody.innerHTML = list.map((p, idx) => `
        <tr data-index="${idx}">
            <td><span class="order-badge">${idx + 1}</span></td>
            <td>
                <input type="text" class="schedule-input-name" value="${p.name || ''}" placeholder="例：第 ${idx + 1} 節">
            </td>
            <td>
                <input type="time" class="schedule-input-time input-start" value="${p.start || '08:00'}">
            </td>
            <td>
                <input type="time" class="schedule-input-time input-end" value="${p.end || '08:45'}">
            </td>
            <td class="action-btns">
                <button type="button" class="btn-delete" onclick="deletePeriodRow(${idx})" title="刪除此節次">🗑️ 刪除</button>
            </td>
        </tr>
    `).join('');
}

function addPeriodRow() {
    syncInputsToState();
    const list = scheduleData[currentTab];
    const nextNum = list.length + 1;

    // 預設接在最後一節結束時間後 10 分鐘
    let defaultStart = '08:15';
    let defaultEnd = '09:00';
    if (list.length > 0 && list[list.length - 1].end) {
        const [h, m] = list[list.length - 1].end.split(':').map(Number);
        const startMins = h * 60 + m + 10;
        const endMins = startMins + 45;
        const fmt = (mins) => {
            const clamped = Math.min(23 * 60 + 59, mins);
            return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
        };
        defaultStart = fmt(startMins);
        defaultEnd = fmt(endMins);
    }

    const prefix = currentTab === 'weekday' ? 'p' : 'w';
    list.push({
        id: `${prefix}_${Date.now()}_${nextNum}`,
        name: `第 ${nextNum} 節`,
        start: defaultStart,
        end: defaultEnd
    });
    renderScheduleTable();
}

function deletePeriodRow(idx) {
    syncInputsToState();
    const list = scheduleData[currentTab];
    if (list.length <= 1) {
        return alert("⚠️ 至少需保留 1 個節次！");
    }
    const targetName = list[idx].name || `第 ${idx + 1} 節`;
    if (!confirm(`確定要刪除「${targetName}」嗎？`)) return;

    list.splice(idx, 1);
    renderScheduleTable();
}

function sortPeriodsByStart() {
    syncInputsToState();
    scheduleData[currentTab].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    renderScheduleTable();
}

function resetDefaultSchedule() {
    const label = currentTab === 'weekday' ? '平日課表（週一～週五）' : '假日課表（週六～週日）';
    if (!confirm(`確定要將「${label}」恢復成預設範本嗎？（需按「儲存課表設定」才會寫入雲端）`)) return;
    scheduleData[currentTab] = cloneDefault(currentTab);
    renderScheduleTable();
}

async function saveScheduleConfig() {
    syncInputsToState();

    // 檢查平日與假日資料合法性
    for (const type of ['weekday', 'weekend']) {
        const label = type === 'weekday' ? '平日課表' : '假日課表';
        const list = scheduleData[type];
        if (!list || list.length === 0) {
            return alert(`⚠️ ${label}至少需要有 1 個節次！`);
        }
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (!p.name) return alert(`⚠️ ${label}第 ${i + 1} 列的「節次名稱」不可空白！`);
            if (!p.start || !p.end) return alert(`⚠️ ${label}「${p.name}」的起訖時間不可空白！`);
            if (p.start >= p.end) return alert(`⚠️ ${label}「${p.name}」的結束時間必須晚於開始時間！`);
            if (!p.id) p.id = `${type === 'weekday' ? 'p' : 'w'}_${i + 1}`;
        }
    }

    try {
        await window.db.ref('scheduleConfig').set(scheduleData);
        if (typeof logActivity === 'function') {
            await logActivity(
                '班級管理',
                `更新節次時間表（平日 ${scheduleData.weekday.length} 節、假日 ${scheduleData.weekend.length} 節）`
            );
        }
        alert("✅ 課表與節次時間已儲存並同步至雲端！");
    } catch (err) {
        console.error("儲存課表失敗：", err);
        alert("儲存失敗，請檢查網路連線！");
    }
}

loadScheduleConfig();