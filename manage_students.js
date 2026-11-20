const DEFAULT_CATEGORIES = [
    '周間普通班', '周間分組班(數)', '周間分組班(英)', '周間分組班(自)',
    '周間晚自習', '週六假日班', '週六資優班', '校隊', '社團'
];

let MULTI_CATEGORIES = [];
let masterStudents = {};
let rosterTemplate = {};
let displayList = [];
let editingContext = { studentNumber: null, category: null };

async function loadAllData() {
    const [stuSnap, tplSnap, catSnap] = await Promise.all([
        window.db.ref('students').once('value'),
        window.db.ref('rosterTemplate').once('value'),
        window.db.ref('categories').once('value')
    ]);

    rosterTemplate = tplSnap.val() || { "周間普通班": {} };
    masterStudents = stuSnap.val();

    // 動態讀取班種（排除周間普通班）
    const rawCats = catSnap.val();
    const allCats = rawCats
        ? (Array.isArray(rawCats) ? rawCats.filter(Boolean) : Object.values(rawCats))
        : [...DEFAULT_CATEGORIES];
    MULTI_CATEGORIES = allCats.filter(c => c !== '周間普通班');

    if (!masterStudents) {
        masterStudents = {};
        if (rosterTemplate['周間普通班']) {
            for (let cls in rosterTemplate['周間普通班']) {
                rosterTemplate['周間普通班'][cls].forEach(stu => {
                    if (stu.id !== "_placeholder" && stu.studentNumber) {
                        masterStudents[stu.studentNumber] = {
                            studentNumber: stu.studentNumber,
                            name: stu.name,
                            homeroom: cls,
                            seatNo: stu.id
                        };
                    }
                });
            }
            if (Object.keys(masterStudents).length > 0) {
                await window.db.ref('students').set(masterStudents);
            }
        }
    }

    renderTableHeader();
    populateHomeroomSelect();
    buildDisplayList();
    filterTable();
}

function renderTableHeader() {
    const thead = document.getElementById('studentTableHead');
    if (!thead) return;
    const catHeaders = MULTI_CATEGORIES.map(cat => `<th>${cat}</th>`).join('');
    thead.innerHTML = `
        <tr style="white-space: nowrap;">
            <th width="4%"><input type="checkbox" onchange="toggleSelectAll(this)"></th>
            <th>學號</th>
            <th>姓名</th>
            <th>原班級 (座號)</th>
            ${catHeaders}
            <th>操作</th>
        </tr>
    `;
}

function populateHomeroomSelect() {
    const sel = document.getElementById('newStuHomeroom');
    const classes = Object.keys(rosterTemplate['周間普通班'] || {}).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    sel.innerHTML = '<option value="">原班級(選填)</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
}

function buildDisplayList() {
    const lookup = {};
    MULTI_CATEGORIES.forEach(cat => {
        lookup[cat] = {};
        if (rosterTemplate[cat]) {
            for (let cls in rosterTemplate[cat]) {
                rosterTemplate[cat][cls].forEach(stu => {
                    if (stu.id === "_placeholder") return;
                    const key = stu.studentNumber || stu.id;
                    if (!lookup[cat][key]) lookup[cat][key] = [];
                    if (!lookup[cat][key].includes(cls)) lookup[cat][key].push(cls);
                });
            }
        }
    });

    displayList = Object.values(masterStudents).map(s => {
        const fallbackId = s.homeroom ? `${s.homeroom}-${s.seatNo}` : s.studentNumber;
        const memberships = {};
        MULTI_CATEGORIES.forEach(cat => {
            memberships[cat] = lookup[cat][s.studentNumber] || lookup[cat][fallbackId] || [];
        });
        return { ...s, memberships };
    });

    displayList.sort((a, b) => {
        const cCmp = (a.homeroom || 'zzz').localeCompare(b.homeroom || 'zzz', undefined, { numeric: true });
        if (cCmp !== 0) return cCmp;
        const sCmp = (a.seatNo || '999').localeCompare(b.seatNo || '999', undefined, { numeric: true });
        if (sCmp !== 0) return sCmp;
        return a.studentNumber.localeCompare(b.studentNumber, undefined, { numeric: true });
    });
}

function filterTable() {
    const kw = document.getElementById('searchInput').value.trim().toLowerCase();
    const list = !kw ? displayList : displayList.filter(s => {
        const allGroups = Object.values(s.memberships).flat().join(' ').toLowerCase();
        return s.studentNumber.toLowerCase().includes(kw) ||
               s.name.toLowerCase().includes(kw) ||
               (s.homeroom || '').toLowerCase().includes(kw) ||
               allGroups.includes(kw);
    });
    renderTable(list);
}

function renderTable(list) {
    const tbody = document.getElementById('studentTableBody');
    const colCount = MULTI_CATEGORIES.length + 5;
    document.getElementById('totalCount').innerText = `共 ${list.length} 人`;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" style="color:#7f8c8d;">尚無符合條件的學生資料</td></tr>`;
        return;
    }

    const renderCell = (stuNum, cat, arr) => {
        const content = arr.length > 0
            ? arr.map(item => `<span class="tag-pill">${item}</span>`).join('')
            : `<span class="tag-empty">無</span>`;
        return `<td class="clickable-cell" onclick="openMultiModal('${stuNum}', '${cat}')" title="點擊設定${cat}">${content}</td>`;
    };

    tbody.innerHTML = list.map(s => `
        <tr style="white-space: nowrap;">
            <td><input type="checkbox" class="stu-checkbox" value="${s.studentNumber}"></td>
            <td style="color:#2980b9; font-family: monospace; font-weight:bold;">${s.studentNumber}</td>
            <td style="font-weight:bold;">${s.name}</td>
            <td>${s.homeroom ? `${s.homeroom} (${s.seatNo}號)` : '<span class="tag-empty">未分班</span>'}</td>
            ${MULTI_CATEGORIES.map(cat => renderCell(s.studentNumber, cat, s.memberships[cat] || [])).join('')}
            <td class="action-btns">
                <button class="btn-edit" onclick="editMasterStudent('${s.studentNumber}')" title="修改基本資料">✏️</button>
                <button class="btn-delete" onclick="deleteMasterStudent('${s.studentNumber}')" title="永久刪除學生">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// 🌟 多選 Modal 邏輯（雙向同步到 rosterTemplate）
function openMultiModal(studentNumber, category) {
    const stu = masterStudents[studentNumber];
    const availableClasses = Object.keys(rosterTemplate[category] || {}).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (availableClasses.length === 0) {
        return alert(`「${category}」目前尚未建立任何班級！\n請先至「🏫 班級資料管理」建立後再回來設定。`);
    }

    editingContext = { studentNumber, category };
    document.getElementById('multiModalTitle').innerText = `設定 ${stu.name} 的「${category}」`;

    const currentEntry = displayList.find(s => s.studentNumber === studentNumber);
    const currentSelected = currentEntry ? currentEntry.memberships[category] : [];

    document.getElementById('multiCheckboxContainer').innerHTML = availableClasses.map(cls => `
        <label>
            <input type="checkbox" class="multi-opt" value="${cls}" ${currentSelected.includes(cls) ? 'checked' : ''}>
            <span>${cls}</span>
        </label>
    `).join('');

    document.getElementById('multiSelectModal').style.display = 'flex';
}

function closeMultiModal() {
    document.getElementById('multiSelectModal').style.display = 'none';
}

async function saveMultiSelect() {
    const { studentNumber, category } = editingContext;
    const stu = masterStudents[studentNumber];
    const selectedClasses = Array.from(document.querySelectorAll('.multi-opt:checked')).map(cb => cb.value);

    const origStr = stu.homeroom ? `${stu.homeroom} (${stu.seatNo}號)` : '未分班';
    const entryId = stu.homeroom ? `${stu.homeroom}-${stu.seatNo}` : stu.studentNumber;

    // 同步更新該分類下的所有班級名單
    for (let cls in rosterTemplate[category]) {
        let list = rosterTemplate[category][cls] || [];
        const existsIdx = list.findIndex(s => s.studentNumber === studentNumber || s.id === entryId);

        if (selectedClasses.includes(cls)) {
            if (existsIdx === -1) {
                list.push({ id: entryId, studentNumber: stu.studentNumber, name: stu.name, originalClass: origStr, pos: 0 });
            }
        } else {
            if (existsIdx !== -1) {
                list.splice(existsIdx, 1);
                if (list.length === 0) list.push({ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 });
            }
        }
        rosterTemplate[category][cls] = list;
    }

    await window.db.ref(`rosterTemplate/${category}`).set(rosterTemplate[category]);
    if (typeof logActivity === 'function') {
        const resultText = selectedClasses.length > 0 ? selectedClasses.join('、') : '無';
        await logActivity('轉班/異動', `更新學生 ${stu.studentNumber} ${stu.name} 的「${category}」歸屬為：${resultText}`);
    }

    closeMultiModal();
    await loadAllData();
}

// 單筆新增學生
async function addMasterStudent() {
    const num = document.getElementById('newStuNumber').value.trim();
    const name = document.getElementById('newStuName').value.trim();
    const homeroom = document.getElementById('newStuHomeroom').value;
    const seatNo = document.getElementById('newStuSeat').value.trim();

    if (!num || !name) return alert("⚠️ 學號與姓名為必填！");
    if (masterStudents[num]) return alert("⚠️ 此學號已存在！");
    if (homeroom && !seatNo) return alert("⚠️ 已選擇原班級，請填寫座號！");

    masterStudents[num] = { studentNumber: num, name, homeroom, seatNo };

    if (homeroom) {
        if (!rosterTemplate['周間普通班'][homeroom]) {
            rosterTemplate['周間普通班'][homeroom] = [{ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 }];
        }
        rosterTemplate['周間普通班'][homeroom].push({ id: seatNo, studentNumber: num, name, pos: 0 });
        await window.db.ref(`rosterTemplate/周間普通班/${homeroom}`).set(rosterTemplate['周間普通班'][homeroom]);
    }

    await window.db.ref(`students/${num}`).set(masterStudents[num]);
    if (typeof logActivity === 'function') {
        await logActivity('新增學生', `新增學生主檔：${num} ${name}（${homeroom ? `${homeroom} ${seatNo}號` : '未分班'}）`);
    }

    document.getElementById('newStuNumber').value = '';
    document.getElementById('newStuName').value = '';
    document.getElementById('newStuSeat').value = '';
    await loadAllData();
}

// 修改學生基本資料（姓名、原班級、座號）並同步全校
async function editMasterStudent(studentNumber) {
    const stu = masterStudents[studentNumber];
    if (!stu) return;

    const oldSummary = `${stu.name} (${stu.homeroom ? `${stu.homeroom} ${stu.seatNo}號` : '未分班'})`;

    const newName = prompt("修改姓名：", stu.name);
    if (!newName || !newName.trim()) return;
    const newHomeroom = prompt("修改原班級（留空代表未分班，須為已建立之普通班）：", stu.homeroom || "");
    if (newHomeroom === null) return;
    const trimmedHome = newHomeroom.trim();

    if (trimmedHome && (!rosterTemplate['周間普通班'] || !rosterTemplate['周間普通班'][trimmedHome])) {
        return alert(`班級「${trimmedHome}」不存在！請先至班級管理建立。`);
    }

    let newSeat = stu.seatNo || "";
    if (trimmedHome) {
        newSeat = prompt("修改座號：", stu.seatNo || "");
        if (!newSeat || !newSeat.trim()) return;
        newSeat = newSeat.trim();
    } else {
        newSeat = "";
    }

    // 從舊普通班移除
    if (stu.homeroom && rosterTemplate['周間普通班'] && rosterTemplate['周間普通班'][stu.homeroom]) {
        rosterTemplate['周間普通班'][stu.homeroom] = rosterTemplate['周間普通班'][stu.homeroom].filter(s => s.studentNumber !== studentNumber);
        if (rosterTemplate['周間普通班'][stu.homeroom].length === 0) {
            rosterTemplate['周間普通班'][stu.homeroom].push({ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 });
        }
    }

    // 加入新普通班
    if (trimmedHome) {
        rosterTemplate['周間普通班'][trimmedHome].push({ id: newSeat, studentNumber, name: newName.trim(), pos: 0 });
    }

    // 同步更新其他分類中的姓名與原班級標籤
    const newOrigStr = trimmedHome ? `${trimmedHome} (${newSeat}號)` : '未分班';
    MULTI_CATEGORIES.forEach(cat => {
        if (!rosterTemplate[cat]) return;
        for (let cls in rosterTemplate[cat]) {
            rosterTemplate[cat][cls].forEach(item => {
                if (item.studentNumber === studentNumber) {
                    item.name = newName.trim();
                    item.originalClass = newOrigStr;
                }
            });
        }
    });

    masterStudents[studentNumber] = { studentNumber, name: newName.trim(), homeroom: trimmedHome, seatNo: newSeat };
    await Promise.all([
        window.db.ref(`students/${studentNumber}`).set(masterStudents[studentNumber]),
        window.db.ref('rosterTemplate').set(rosterTemplate)
    ]);

    if (typeof logActivity === 'function') {
        const newSummary = `${newName.trim()} (${trimmedHome ? `${trimmedHome} ${newSeat}號` : '未分班'})`;
        await logActivity('編輯學生', `修改學生 ${studentNumber} 資料：${oldSummary} ➔ ${newSummary}`);
    }

    await loadAllData();
}

// 永久刪除學生（同步從所有班級與社團清除）
async function deleteMasterStudent(studentNumber) {
    const stu = masterStudents[studentNumber];
    if (!confirm(`⚠️ 確定要永久刪除「${stu.name} (${studentNumber})」嗎？\n將同步從所有班級、社團與校隊中移除。`)) return;
    await executeDeleteMaster([studentNumber]);
}

async function bulkDeleteMasterStudents() {
    const checked = document.querySelectorAll('.stu-checkbox:checked');
    if (checked.length === 0) return alert("請先勾選要刪除的學生！");
    if (!confirm(`⚠️ 確定要永久刪除這 ${checked.length} 位學生嗎？`)) return;
    await executeDeleteMaster(Array.from(checked).map(cb => cb.value));
}

async function executeDeleteMaster(studentNumbers) {
    // 刪除前先記錄名單
    const deletedInfo = studentNumbers.map(num => {
        const s = masterStudents[num];
        return s ? `${num} ${s.name}` : num;
    });

    studentNumbers.forEach(num => delete masterStudents[num]);

    for (let cat in rosterTemplate) {
        for (let cls in rosterTemplate[cat]) {
            rosterTemplate[cat][cls] = rosterTemplate[cat][cls].filter(s => s.id === "_placeholder" || !studentNumbers.includes(s.studentNumber));
            if (rosterTemplate[cat][cls].length === 0) {
                rosterTemplate[cat][cls].push({ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 });
            }
        }
    }

    await Promise.all([
        window.db.ref('students').set(masterStudents),
        window.db.ref('rosterTemplate').set(rosterTemplate)
    ]);

    if (typeof logActivity === 'function' && deletedInfo.length > 0) {
        await logActivity('移除學生', `永久刪除 ${deletedInfo.length} 位學生主檔：${deletedInfo.join('、')}`);
    }

    await loadAllData();
}

// 批量匯入
function openBulkModal() {
    document.getElementById('bulkImportModal').style.display = 'flex';
    document.getElementById('bulkTextarea').value = '';
}
function closeBulkModal() {
    document.getElementById('bulkImportModal').style.display = 'none';
}

async function processBulkImport() {
    const text = document.getElementById('bulkTextarea').value;
    if (!text.trim()) return alert("請貼上資料！");

    const lines = text.split('\n');
    let count = 0;

    for (let line of lines) {
        if (!line.trim()) continue;
        let parts = line.split('\t');
        if (parts.length < 4) parts = line.trim().split(/[\s,]+/);
        if (parts.length < 4) continue;

        const [homeroom, name, seatNo, num] = parts.map(p => p.trim());
        masterStudents[num] = { studentNumber: num, name, homeroom, seatNo };

        if (!rosterTemplate['周間普通班']) rosterTemplate['周間普通班'] = {};
        if (!rosterTemplate['周間普通班'][homeroom]) {
            rosterTemplate['周間普通班'][homeroom] = [{ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 }];
        }

        const existing = rosterTemplate['周間普通班'][homeroom].find(s => s.studentNumber === num || s.id === seatNo);
        if (existing) {
            existing.id = seatNo; existing.studentNumber = num; existing.name = name;
        } else {
            rosterTemplate['周間普通班'][homeroom].push({ id: seatNo, studentNumber: num, name, pos: 0 });
        }
        count++;
    }

    if (count === 0) return alert("⚠️ 無法解析！請確認格式為 4 欄：原班級  姓名  座號  學號");

    await Promise.all([
        window.db.ref('students').set(masterStudents),
        window.db.ref('rosterTemplate').set(rosterTemplate)
    ]);

    if (typeof logActivity === 'function') {
        await logActivity('新增學生', `批量匯入 ${count} 筆學生資料至全校總檔`);
    }

    closeBulkModal();
    alert(`成功匯入 ${count} 筆學生資料！`);
    await loadAllData();
}

// 學年自動升級（同步升級總檔與所有班級／社團）
async function upgradeAcademicYear() {
    let pass = prompt("⚠️ 危險操作：將把 7 升 8、8 升 9，並完全刪除 9 年級畢業生！\n請輸入「確認升級」以執行：");
    if (pass !== "確認升級") return alert("已取消。");

    const nextGrade = (str) => str.replace(/([789123])(\d{2})/g, (m, p1, p2) => {
        const g = parseInt(p1);
        if (g === 9 || g === 3) return "GRADUATED";
        return (g + 1) + p2;
    });

    const newStudents = {};
    const graduatedNums = new Set();

    for (let num in masterStudents) {
        const s = masterStudents[num];
        const nextHome = s.homeroom ? nextGrade(s.homeroom) : "";
        if (nextHome.includes("GRADUATED")) {
            graduatedNums.add(num);
        } else {
            newStudents[num] = { ...s, homeroom: nextHome };
        }
    }

    const newTemplate = {};
    for (let cat in rosterTemplate) {
        newTemplate[cat] = {};
        for (let cls in rosterTemplate[cat]) {
            const nextCls = nextGrade(cls);
            if (!nextCls.includes("GRADUATED")) {
                let updatedList = rosterTemplate[cat][cls].filter(s => s.id === "_placeholder" || !graduatedNums.has(s.studentNumber)).map(s => {
                    if (s.id === "_placeholder") return s;
                    return { ...s, originalClass: s.originalClass ? nextGrade(s.originalClass) : "" };
                });
                if (updatedList.length === 0) updatedList.push({ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 });
                newTemplate[cat][nextCls] = updatedList;
            }
        }
    }

    await Promise.all([
        window.db.ref('students').set(newStudents),
        window.db.ref('rosterTemplate').set(newTemplate)
    ]);

    if (typeof logActivity === 'function') {
        await logActivity('班級管理', `執行全校學年自動升級（共畢業移除 ${graduatedNums.size} 位學生）`);
    }

    alert("🎉 新學年升級完成！");
    await loadAllData();
}

function toggleSelectAll(source) {
    document.querySelectorAll('.stu-checkbox').forEach(cb => cb.checked = source.checked);
}

loadAllData();