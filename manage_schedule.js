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
let scheduleTemplates = {};
let currentTab = 'weekday';

function clonePeriods(arr) {
    return (Array.isArray(arr) ? arr : []).filter(Boolean).map(p => ({ ...p }));
}

function cloneDefault(type) {
    return clonePeriods(DEFAULT_SCHEDULE[type]);
}

async function loadScheduleConfig() {
    try {
        const [cfgSnap, tplSnap] = await Promise.all([
            window.db.ref('scheduleConfig').once('value'),
            window.db.ref('scheduleTemplates').once('value')
        ]);

        const val = cfgSnap.val();
        scheduleTemplates = tplSnap.val() || {};

        if (!val) {
            scheduleData = {
                weekday: cloneDefault('weekday'),
                weekend: cloneDefault('weekend')
            };
            await window.db.ref('scheduleConfig').set(scheduleData);
        } else {
            scheduleData.weekday = Array.isArray(val.weekday) && val.weekday.length > 0
                ? clonePeriods(val.weekday)
                : cloneDefault('weekday');
            scheduleData.weekend = Array.isArray(val.weekend) && val.weekend.length > 0
                ? clonePeriods(val.weekend)
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

function validateScheduleData() {
    for (const type of ['weekday', 'weekend']) {
        const label = type === 'weekday' ? '平日課表' : '假日課表';
        const list = scheduleData[type];
        if (!list || list.length === 0) {
            alert(`⚠️ ${label}至少需要有 1 個節次！`);
            return false;
        }
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (!p.name) {
                alert(`⚠️ ${label}第 ${i + 1} 列的「節次名稱」不可空白！`);
                return false;
            }
            if (!p.start || !p.end) {
                alert(`⚠️ ${label}「${p.name}」的起訖時間不可空白！`);
                return false;
            }
            if (p.start >= p.end) {
                alert(`⚠️ ${label}「${p.name}」的結束時間必須晚於開始時間！`);
                return false;
            }
            if (!p.id) p.id = `${type === 'weekday' ? 'p' : 'w'}_${i + 1}`;
        }
    }
    return true;
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
    if (!validateScheduleData()) return;

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

// ==================== 存為課表模板 ====================
function openSaveTemplateModal() {
    syncInputsToState();
    if (!validateScheduleData()) return;
    document.getElementById('newTemplateNameInput').value = '';
    document.getElementById('saveTemplateModal').style.display = 'flex';
    setTimeout(() => document.getElementById('newTemplateNameInput').focus(), 50);
}

function closeSaveTemplateModal() {
    document.getElementById('saveTemplateModal').style.display = 'none';
}

async function confirmSaveTemplate() {
    const name = document.getElementById('newTemplateNameInput').value.trim();
    if (!name) return alert("⚠️ 請輸入課表模板名稱！");

    const exists = Object.values(scheduleTemplates).some(t => t && t.name === name);
    if (exists) return alert(`⚠️ 已經有名為「${name}」的課表模板，請換一個名稱或從「課表模板」中編輯！`);

    const id = `tpl_${Date.now()}`;
    const newTpl = {
        id,
        name,
        weekday: clonePeriods(scheduleData.weekday),
        weekend: clonePeriods(scheduleData.weekend),
        updatedAt: Date.now()
    };

    try {
        await window.db.ref(`scheduleTemplates/${id}`).set(newTpl);
        scheduleTemplates[id] = newTpl;

        if (typeof logActivity === 'function') {
            await logActivity('班級管理', `新增課表模板「${name}」（平日 ${newTpl.weekday.length} 節、假日 ${newTpl.weekend.length} 節）`);
        }

        closeSaveTemplateModal();
        alert(`✅ 已成功將目前課表存為模板「${name}」！`);
    } catch (err) {
        console.error("儲存課表模板失敗：", err);
        alert("儲存模板失敗，請檢查網路連線！");
    }
}

// ==================== 課表模板管理（下拉選單／使用／編輯／刪除） ====================
async function openTemplateModal() {
    try {
        const snap = await window.db.ref('scheduleTemplates').once('value');
        scheduleTemplates = snap.val() || {};
    } catch (err) {
        console.error("讀取課表模板失敗：", err);
    }

    cancelEditTemplateBox();
    renderTemplateDropdown();
    document.getElementById('templateModal').style.display = 'flex';
}

function closeTemplateModal() {
    document.getElementById('templateModal').style.display = 'none';
    cancelEditTemplateBox();
}

function renderTemplateDropdown(selectedId = null) {
    const sel = document.getElementById('templateSelect');
    const list = Object.values(scheduleTemplates)
        .filter(Boolean)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const hasTemplates = list.length > 0;
    document.getElementById('btnUseTpl').disabled = !hasTemplates;
    document.getElementById('btnEditTpl').disabled = !hasTemplates;
    document.getElementById('btnDeleteTpl').disabled = !hasTemplates;

    if (!hasTemplates) {
        sel.innerHTML = '<option value="">（尚無已儲存的課表模板）</option>';
        document.getElementById('templateMetaInfo').innerHTML = '目前尚未建立任何課表模板，請先按「📥 存為課表模板」建立。';
        return;
    }

    sel.innerHTML = list.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    if (selectedId && scheduleTemplates[selectedId]) {
        sel.value = selectedId;
    }
    onTemplateSelectChange();
}

function onTemplateSelectChange() {
    cancelEditTemplateBox();
    const id = document.getElementById('templateSelect').value;
    const tpl = scheduleTemplates[id];
    const infoEl = document.getElementById('templateMetaInfo');

    if (!tpl) {
        infoEl.innerHTML = '尚未選擇模板。';
        return;
    }

    const wdCount = Array.isArray(tpl.weekday) ? tpl.weekday.length : 0;
    const weCount = Array.isArray(tpl.weekend) ? tpl.weekend.length : 0;
    const updatedStr = tpl.updatedAt ? new Date(tpl.updatedAt).toLocaleString() : '-';

    infoEl.innerHTML = `
        <div><b>模板名稱：</b><span style="color:#ebd29b;">${tpl.name}</span></div>
        <div><b>內含節數：</b>平日 ${wdCount} 節 ／ 假日 ${weCount} 節</div>
        <div><b>最後更新：</b>${updatedStr}</div>
    `;
}

async function applySelectedTemplate() {
    const id = document.getElementById('templateSelect').value;
    const tpl = scheduleTemplates[id];
    if (!tpl) return alert("請先選擇一個課表模板！");

    if (!confirm(`確定要套用課表模板「${tpl.name}」嗎？\n這將會立即覆蓋目前的平日與假日課表並同步至雲端。`)) return;

    scheduleData = {
        weekday: clonePeriods(tpl.weekday),
        weekend: clonePeriods(tpl.weekend)
    };

    try {
        await window.db.ref('scheduleConfig').set(scheduleData);
        if (typeof logActivity === 'function') {
            await logActivity('班級管理', `套用課表模板「${tpl.name}」`);
        }
        renderScheduleTable();
        closeTemplateModal();
        alert(`✅ 已套用課表模板「${tpl.name}」並同步至全站！`);
    } catch (err) {
        console.error("套用模板失敗：", err);
        alert("套用失敗，請檢查網路連線！");
    }
}

function toggleEditTemplateBox() {
    const id = document.getElementById('templateSelect').value;
    const tpl = scheduleTemplates[id];
    if (!tpl) return;

    const box = document.getElementById('editTemplateBox');
    if (box.style.display === 'block') {
        cancelEditTemplateBox();
        return;
    }

    document.getElementById('editTemplateNameInput').value = tpl.name;
    document.getElementById('overwriteTemplateContent').checked = false;
    box.style.display = 'block';
    document.getElementById('editTemplateNameInput').focus();
}

function cancelEditTemplateBox() {
    document.getElementById('editTemplateBox').style.display = 'none';
}

async function confirmEditTemplate() {
    const id = document.getElementById('templateSelect').value;
    const tpl = scheduleTemplates[id];
    if (!tpl) return;

    const newName = document.getElementById('editTemplateNameInput').value.trim();
    if (!newName) return alert("⚠️ 模板名稱不可空白！");

    const duplicate = Object.values(scheduleTemplates).some(t => t && t.id !== id && t.name === newName);
    if (duplicate) return alert(`⚠️ 已經有名為「${newName}」的課表模板！`);

    const overwriteContent = document.getElementById('overwriteTemplateContent').checked;
    if (overwriteContent) {
        syncInputsToState();
        if (!validateScheduleData()) return;
    }

    const oldName = tpl.name;
    const updatedTpl = {
        ...tpl,
        name: newName,
        weekday: overwriteContent ? clonePeriods(scheduleData.weekday) : clonePeriods(tpl.weekday),
        weekend: overwriteContent ? clonePeriods(scheduleData.weekend) : clonePeriods(tpl.weekend),
        updatedAt: Date.now()
    };

    try {
        await window.db.ref(`scheduleTemplates/${id}`).set(updatedTpl);
        scheduleTemplates[id] = updatedTpl;

        if (typeof logActivity === 'function') {
            const note = overwriteContent ? '並覆蓋更新課表內容' : '';
            await logActivity('班級管理', `編輯課表模板「${oldName}」➔「${newName}」${note}`);
        }

        cancelEditTemplateBox();
        renderTemplateDropdown(id);
        alert(`✅ 課表模板「${newName}」已更新！`);
    } catch (err) {
        console.error("編輯課表模板失敗：", err);
        alert("更新失敗，請檢查網路連線！");
    }
}

async function deleteSelectedTemplate() {
    const id = document.getElementById('templateSelect').value;
    const tpl = scheduleTemplates[id];
    if (!tpl) return;

    if (!confirm(`⚠️ 確定要永久刪除課表模板「${tpl.name}」嗎？`)) return;

    try {
        await window.db.ref(`scheduleTemplates/${id}`).remove();
        delete scheduleTemplates[id];

        if (typeof logActivity === 'function') {
            await logActivity('班級管理', `刪除課表模板「${tpl.name}」`);
        }

        renderTemplateDropdown();
        alert(`🗑️ 已刪除課表模板「${tpl.name}」。`);
    } catch (err) {
        console.error("刪除課表模板失敗：", err);
        alert("刪除失敗，請檢查網路連線！");
    }
}

loadScheduleConfig();