let masterStudents = {}; // 全校學生總檔 { studentNumber: { studentNumber, name, homeroom, seatNo } }

async function getTemplate() {
    let snap = await window.db.ref('rosterTemplate').once('value');
    return snap.val() || { "周間普通班": {} };
}

async function getMasterStudents() {
    let snap = await window.db.ref('students').once('value');
    let data = snap.val();

    // 自動相容：若 students 總檔為空，自動從現有周間普通班同步一份建立總檔
    if (!data) {
        const template = await getTemplate();
        data = {};
        if (template['周間普通班']) {
            for (let cls in template['周間普通班']) {
                template['周間普通班'][cls].forEach(stu => {
                    if (stu.id !== "_placeholder" && stu.studentNumber) {
                        data[stu.studentNumber] = {
                            studentNumber: stu.studentNumber,
                            name: stu.name,
                            homeroom: cls,
                            seatNo: stu.id
                        };
                    }
                });
            }
            if (Object.keys(data).length > 0) {
                await window.db.ref('students').set(data);
            }
        }
    }
    masterStudents = data || {};
    return masterStudents;
}

async function initPage() {
    await getMasterStudents();
    await updateClassSelect();
}

async function updateClassSelect() {
    const category = document.getElementById('categorySelect').value;
    const classSelect = document.getElementById('classSelect');
    const data = await getTemplate();
    
    classSelect.innerHTML = '';
    if (data[category] && Object.keys(data[category]).length > 0) {
        const sortedClasses = Object.keys(data[category]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        sortedClasses.forEach(cls => {
            classSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
        });
    } else {
        classSelect.innerHTML = '<option value="">(無班級，請按 ➕ 建立)</option>';
    }
    await renderClassStudents();
}

// 班級 CRUD（僅能在此頁執行）
async function addClass() {
    const category = document.getElementById('categorySelect').value;
    const newName = prompt(`在「${category}」新增班級名稱 (例: 801 或 羽球隊)：`);
    if (!newName || !newName.trim()) return;
    const trimmed = newName.trim();

    const data = await getTemplate();
    if (!data[category]) data[category] = {};
    if (data[category][trimmed]) return alert("此班級已經存在！");

    data[category][trimmed] = [{ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 }];
    await window.db.ref('rosterTemplate').set(data);
    if (typeof logActivity === 'function') {
        await logActivity('班級管理', `在 [${category}] 新增班級「${trimmed}」`);
    }

    await updateClassSelect();
    document.getElementById('classSelect').value = trimmed;
    await renderClassStudents();
}

async function editClass() {
    const category = document.getElementById('categorySelect').value;
    const oldName = document.getElementById('classSelect').value;
    if (!oldName) return alert("請先選擇要修改的班級！");

    const newName = prompt(`請輸入「${oldName}」的新名稱：`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const trimmed = newName.trim();

    const data = await getTemplate();
    if (data[category][trimmed]) return alert("此班級名稱已存在！");

    data[category][trimmed] = data[category][oldName];
    delete data[category][oldName];

    // 若更名的是周間普通班，同步更新總檔的 homeroom
    if (category === '周間普通班') {
        await getMasterStudents();
        let updates = {};
        for (let num in masterStudents) {
            if (masterStudents[num].homeroom === oldName) {
                updates[`students/${num}/homeroom`] = trimmed;
            }
        }
        if (Object.keys(updates).length > 0) await window.db.ref().update(updates);
    }

    await window.db.ref('rosterTemplate').set(data);
    if (typeof logActivity === 'function') {
        await logActivity('班級管理', `將 [${category}] 班級「${oldName}」更名為「${trimmed}」`);
    }

    await updateClassSelect();
    document.getElementById('classSelect').value = trimmed;
    await renderClassStudents();
}

async function deleteClass() {
    const category = document.getElementById('categorySelect').value;
    const className = document.getElementById('classSelect').value;
    if (!className) return alert("請先選擇要刪除的班級！");

    if (!confirm(`⚠️ 確定要刪除「${className}」嗎？\n（僅會移除此班級，學生個人檔案仍保留在全校總檔中）`)) return;

    const data = await getTemplate();
    delete data[category][className];

    if (category === '周間普通班') {
        await getMasterStudents();
        let updates = {};
        for (let num in masterStudents) {
            if (masterStudents[num].homeroom === className) {
                updates[`students/${num}/homeroom`] = "";
                updates[`students/${num}/seatNo`] = "";
            }
        }
        if (Object.keys(updates).length > 0) await window.db.ref().update(updates);
    }

    await window.db.ref('rosterTemplate').set(data);
    if (typeof logActivity === 'function') {
        await logActivity('班級管理', `刪除 [${category}] 班級「${className}」`);
    }

    await updateClassSelect();
}

// 渲染本班名單
async function renderClassStudents() {
    const category = document.getElementById('categorySelect').value;
    const className = document.getElementById('classSelect').value;
    const thead = document.querySelector('table thead');
    const tbody = document.getElementById('classTableBody');
    const btnEdit = document.getElementById('btnEditClass');
    const btnDel = document.getElementById('btnDeleteClass');

    if (!className) {
        btnEdit.style.display = 'none'; btnDel.style.display = 'none';
        thead.innerHTML = `<tr><th>學號</th><th>姓名</th><th>操作</th></tr>`;
        tbody.innerHTML = '<tr><td colspan="3" style="color:#7f8c8d;">請點擊上方 ➕ 建立班級</td></tr>';
        return;
    }
    btnEdit.style.display = 'inline-block'; btnDel.style.display = 'inline-block';

    if (category === '周間普通班') {
        thead.innerHTML = `<tr><th width="8%"><input type="checkbox" onchange="toggleSelectAll(this)"></th><th width="12%">座號</th><th width="20%">學號</th><th width="35%">姓名</th><th width="25%">操作</th></tr>`;
    } else {
        thead.innerHTML = `<tr><th width="8%"><input type="checkbox" onchange="toggleSelectAll(this)"></th><th width="20%">學號</th><th width="22%">姓名</th><th width="25%">原班級資料</th><th width="25%">操作</th></tr>`;
    }

    const data = await getTemplate();
    let students = (data[category] && data[category][className]) ? data[category][className] : [];
    students = students.filter(s => s.id !== "_placeholder");

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#7f8c8d;">本班尚無學生，請在上方輸入學號或姓名搜尋加入</td></tr>`;
        return;
    }

    students.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    tbody.innerHTML = students.map(stu => {
        const key = stu.studentNumber || stu.id;
        if (category === '周間普通班') {
            return `
                <tr>
                    <td><input type="checkbox" class="cls-checkbox" value="${key}"></td>
                    <td>${stu.id}</td>
                    <td class="badge-num">${stu.studentNumber || '-'}</td>
                    <td style="font-weight:bold;">${stu.name}</td>
                    <td><button class="btn-delete" onclick="removeFromClass('${key}')" title="移出此班">移出</button></td>
                </tr>`;
        } else {
            return `
                <tr>
                    <td><input type="checkbox" class="cls-checkbox" value="${key}"></td>
                    <td class="badge-num">${stu.studentNumber || '-'}</td>
                    <td style="font-weight:bold;">${stu.name}</td>
                    <td><span class="badge-class">${stu.originalClass || '-'}</span></td>
                    <td><button class="btn-delete" onclick="removeFromClass('${key}')" title="移出此班">移出</button></td>
                </tr>`;
        }
    }).join('');
}

// 即時搜尋全校學生（學號或姓名）
const searchInput = document.getElementById('studentSearchInput');
const searchDropdown = document.getElementById('searchDropdown');

searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim().toLowerCase();
    if (!val) { searchDropdown.style.display = 'none'; return; }

    const matches = Object.values(masterStudents).filter(s =>
        (s.studentNumber && s.studentNumber.toLowerCase().includes(val)) ||
        (s.name && s.name.toLowerCase().includes(val))
    ).slice(0, 15);

    if (matches.length === 0) {
        searchDropdown.innerHTML = '<div style="color:#e74c3c; justify-content:center; cursor:default;">找不到相符的學生（請先至「學生資料管理」建檔）</div>';
    } else {
        searchDropdown.innerHTML = matches.map(s => `
            <div onclick="addStudentToCurrentClass('${s.studentNumber}')">
                <span><span class="badge-num">${s.studentNumber}</span> &nbsp;<b>${s.name}</b></span>
                <span class="badge-class">${s.homeroom ? `${s.homeroom} (${s.seatNo}號)` : '未分班'}</span>
            </div>
        `).join('');
    }
    searchDropdown.style.display = 'block';
});

document.addEventListener('click', (e) => {
    if (e.target !== searchInput) searchDropdown.style.display = 'none';
});

// 點擊搜尋結果，將學生加入目前班級並雙向同步
async function addStudentToCurrentClass(studentNumber) {
    const category = document.getElementById('categorySelect').value;
    const className = document.getElementById('classSelect').value;
    if (!className) return alert("請先建立並選擇一個班級！");

    const stu = masterStudents[studentNumber];
    if (!stu) return;

    const data = await getTemplate();
    if (!data[category][className]) data[category][className] = [{ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 }];

    // 檢查是否已在名單中
    if (data[category][className].some(s => s.studentNumber === studentNumber)) {
        searchDropdown.style.display = 'none';
        searchInput.value = '';
        return alert(`${stu.name} 已經在「${className}」名單中了！`);
    }

    let oldHomeroom = stu.homeroom || "";
    if (category === '周間普通班') {
        let seatNo = prompt(`將「${stu.name}」加入 ${className}，請輸入座號 (例: 01)：`, stu.seatNo || "");
        if (!seatNo || !seatNo.trim()) return;
        seatNo = seatNo.trim();

        // 若原本在其他普通班，先從舊普通班移出
        if (stu.homeroom && data['周間普通班'][stu.homeroom]) {
            data['周間普通班'][stu.homeroom] = data['周間普通班'][stu.homeroom].filter(s => s.studentNumber !== studentNumber);
            if (data['周間普通班'][stu.homeroom].length === 0) {
                data['周間普通班'][stu.homeroom].push({ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 });
            }
        }

        data[category][className].push({ id: seatNo, studentNumber: stu.studentNumber, name: stu.name, pos: 0 });
        stu.homeroom = className;
        stu.seatNo = seatNo;
        await window.db.ref(`students/${studentNumber}`).set(stu);
    } else {
        const origStr = stu.homeroom ? `${stu.homeroom} (${stu.seatNo}號)` : '未分班';
        const entryId = stu.homeroom ? `${stu.homeroom}-${stu.seatNo}` : stu.studentNumber;
        data[category][className].push({
            id: entryId,
            studentNumber: stu.studentNumber,
            name: stu.name,
            originalClass: origStr,
            pos: 0
        });
    }

    await window.db.ref('rosterTemplate').set(data);
    if (typeof logActivity === 'function') {
        const moveNote = (category === '周間普通班' && oldHomeroom && oldHomeroom !== className)
            ? `（原班級：${oldHomeroom}）` : '';
        await logActivity('轉班/異動', `將學生 ${stu.studentNumber} ${stu.name} 加入 [${category}] ${className}${moveNote}`);
    }

    searchInput.value = '';
    searchDropdown.style.display = 'none';
    await renderClassStudents();
}

async function removeFromClass(key) {
    if (!confirm("確定要將這位學生移出本班嗎？（不會刪除全校學生檔案）")) return;
    await executeRemove([key]);
}

async function bulkRemoveFromClass() {
    const checked = document.querySelectorAll('.cls-checkbox:checked');
    if (checked.length === 0) return alert("請先勾選要移出的學生！");
    if (!confirm(`確定要將這 ${checked.length} 位學生移出本班嗎？`)) return;
    await executeRemove(Array.from(checked).map(c => c.value));
}

async function executeRemove(keys) {
    const category = document.getElementById('categorySelect').value;
    const className = document.getElementById('classSelect').value;
    const data = await getTemplate();

    // 紀錄被移出的學生姓名
    const removedNames = (data[category][className] || [])
        .filter(s => s.id !== "_placeholder" && (keys.includes(s.studentNumber) || keys.includes(s.id)))
        .map(s => s.name);

    data[category][className] = data[category][className].filter(s =>
        s.id === "_placeholder" || (!keys.includes(s.studentNumber) && !keys.includes(s.id))
    );
    if (data[category][className].length === 0) {
        data[category][className].push({ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 });
    }

    // 若從周間普通班移出，同步清空總檔的 homeroom
    if (category === '周間普通班') {
        let updates = {};
        keys.forEach(k => {
            if (masterStudents[k]) {
                masterStudents[k].homeroom = "";
                masterStudents[k].seatNo = "";
                updates[`students/${k}/homeroom`] = "";
                updates[`students/${k}/seatNo`] = "";
            }
        });
        if (Object.keys(updates).length > 0) await window.db.ref().update(updates);
    }

    await window.db.ref('rosterTemplate').set(data);
    if (typeof logActivity === 'function' && removedNames.length > 0) {
        await logActivity('移除學生', `從 [${category}] ${className} 移出 ${removedNames.length} 位學生：${removedNames.join('、')}`);
    }

    await renderClassStudents();
}

function toggleSelectAll(source) {
    document.querySelectorAll('.cls-checkbox').forEach(cb => cb.checked = source.checked);
}

// 🌟 批量建立班級 Modal 控制
function openBulkClassModal() {
    const category = document.getElementById('categorySelect').value;
    document.getElementById('bulkClassModalTitle').innerText = `📑 在「${category}」批量建立班級`;
    document.getElementById('bulkClassTextarea').value = '';
    document.getElementById('bulkClassModal').style.display = 'flex';
}

function closeBulkClassModal() {
    document.getElementById('bulkClassModal').style.display = 'none';
}

async function processBulkAddClasses() {
    const category = document.getElementById('categorySelect').value;
    const rawText = document.getElementById('bulkClassTextarea').value;
    if (!rawText.trim()) return alert("請輸入至少一個班級名稱！");

    // 支援換行、半形逗號、全形逗號、頓號分隔
    const names = rawText
        .split(/[\n,，、]+/)
        .map(n => n.trim())
        .filter(n => n.length > 0);

    // 去除輸入清單中重複的名稱
    const uniqueNames = [...new Set(names)];
    if (uniqueNames.length === 0) return alert("沒有有效的班級名稱！");

    const data = await getTemplate();
    if (!data[category]) data[category] = {};

    let addedNames = [];
    let skippedList = [];

    uniqueNames.forEach(clsName => {
        if (data[category][clsName]) {
            skippedList.push(clsName);
        } else {
            data[category][clsName] = [{
                id: "_placeholder",
                name: "系統佔位符 (請勿刪除)",
                pos: -1
            }];
            addedNames.push(clsName);
        }
    });

    if (addedNames.length > 0) {
        await window.db.ref('rosterTemplate').set(data);
        if (typeof logActivity === 'function') {
            await logActivity('班級管理', `在 [${category}] 批量建立 ${addedNames.length} 個班級：${addedNames.join('、')}`);
        }
        await updateClassSelect();
        document.getElementById('classSelect').value = addedNames[0];
        await renderClassStudents();
    }

    closeBulkClassModal();

    let msg = `✅ 成功建立 ${addedNames.length} 個班級！`;
    if (skippedList.length > 0) {
        msg += `\n⚠️ 以下 ${skippedList.length} 個班級已存在，已自動略過：\n${skippedList.join(', ')}`;
    }
    alert(msg);
}

// 🌟🌟🌟 批量移入學生（支援學號/姓名、同名選擇、查無提示） 🌟🌟🌟
function openBulkAddStuModal() {
    const className = document.getElementById('classSelect').value;
    if (!className) return alert("請先建立並選擇一個班級！");
    document.getElementById('bulkAddStuTitle').innerText = `📥 批量移入學生至「${className}」`;
    document.getElementById('bulkAddStuTextarea').value = '';
    document.getElementById('bulkAddStuModal').style.display = 'flex';
}

function closeBulkAddStuModal() {
    document.getElementById('bulkAddStuModal').style.display = 'none';
}

function closeResolveModal() {
    document.getElementById('resolveConflictModal').style.display = 'none';
}

// 共用寫入函式：將多位學生批次寫入目前班級並同步資料庫
async function batchInsertStudentsToClass(studentObjects) {
    if (studentObjects.length === 0) return { added: 0, skipped: 0 };

    const category = document.getElementById('categorySelect').value;
    const className = document.getElementById('classSelect').value;
    const data = await getTemplate();

    if (!data[category]) data[category] = {};
    if (!data[category][className]) {
        data[category][className] = [{ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 }];
    }

    let addedNames = [];
    let skipped = 0;
    let studentUpdates = {};

    for (let stu of studentObjects) {
        // 已在本班則略過
        if (data[category][className].some(s => s.studentNumber === stu.studentNumber)) {
            skipped++;
            continue;
        }

        if (category === '周間普通班') {
            const seatNo = stu.seatNo || stu.studentNumber;
            // 若原本在其他普通班，先從舊班移除
            if (stu.homeroom && stu.homeroom !== className && data['周間普通班'][stu.homeroom]) {
                data['周間普通班'][stu.homeroom] = data['周間普通班'][stu.homeroom].filter(s => s.studentNumber !== stu.studentNumber);
                if (data['周間普通班'][stu.homeroom].length === 0) {
                    data['周間普通班'][stu.homeroom].push({ id: "_placeholder", name: "系統佔位符 (請勿刪除)", pos: -1 });
                }
            }
            data[category][className].push({ id: seatNo, studentNumber: stu.studentNumber, name: stu.name, pos: 0 });
            stu.homeroom = className;
            stu.seatNo = seatNo;
            studentUpdates[`students/${stu.studentNumber}`] = stu;
        } else {
            const origStr = stu.homeroom ? `${stu.homeroom} (${stu.seatNo}號)` : '未分班';
            const entryId = stu.homeroom ? `${stu.homeroom}-${stu.seatNo}` : stu.studentNumber;
            data[category][className].push({
                id: entryId,
                studentNumber: stu.studentNumber,
                name: stu.name,
                originalClass: origStr,
                pos: 0
            });
        }
        addedNames.push(stu.name);
    }

    if (addedNames.length > 0) {
        await window.db.ref('rosterTemplate').set(data);
        if (Object.keys(studentUpdates).length > 0) {
            await window.db.ref().update(studentUpdates);
        }
        if (typeof logActivity === 'function') {
            await logActivity('轉班/異動', `批量將 ${addedNames.length} 位學生移入 [${category}] ${className}：${addedNames.join('、')}`);
        }
        await renderClassStudents();
    }

    return { added: addedNames.length, skipped };
}

async function processBulkAddStudents() {
    const rawText = document.getElementById('bulkAddStuTextarea').value;
    if (!rawText.trim()) return alert("請貼上學號或姓名！");

    await getMasterStudents();
    const allStuList = Object.values(masterStudents);

    const lines = rawText.split(/[\n,，、]+/).map(l => l.trim()).filter(l => l.length > 0);
    const exactMatches = [];
    const duplicateGroups = []; // { query, candidates: [...] }
    const notFound = [];

    lines.forEach(token => {
        // 1. 優先比對學號（唯一值）
        if (masterStudents[token]) {
            if (!exactMatches.some(s => s.studentNumber === token)) {
                exactMatches.push(masterStudents[token]);
            }
            return;
        }

        // 2. 比對姓名
        const nameMatches = allStuList.filter(s => s.name === token);
        if (nameMatches.length === 1) {
            if (!exactMatches.some(s => s.studentNumber === nameMatches[0].studentNumber)) {
                exactMatches.push(nameMatches[0]);
            }
        } else if (nameMatches.length > 1) {
            // 避免重複出現同一個同名群組
            if (!duplicateGroups.some(g => g.query === token)) {
                duplicateGroups.push({ query: token, candidates: nameMatches });
            }
        } else {
            notFound.push(token);
        }
    });

    // 先將精準符合的自動加入
    const result = await batchInsertStudentsToClass(exactMatches);
    closeBulkAddStuModal();

    // 若沒有同名、也沒有查無此人，直接提示完成
    if (duplicateGroups.length === 0 && notFound.length === 0) {
        let msg = `✅ 成功移入 ${result.added} 位學生！`;
        if (result.skipped > 0) msg += `\n（另有 ${result.skipped} 位原本就在本班，已自動略過）`;
        return alert(msg);
    }

    // 若有同名或查無此人，開啟確認視窗
    document.getElementById('resolveSummary').innerHTML =
        `✅ 已自動加入 <b>${result.added}</b> 位精準符合的學生` +
        (result.skipped > 0 ? `（略過 ${result.skipped} 位已在班上者）` : '') + `。`;

    const dupSection = document.getElementById('duplicateSection');
    const dupContainer = document.getElementById('duplicateListContainer');
    const btnConfirm = document.getElementById('btnConfirmDuplicates');

    if (duplicateGroups.length > 0) {
        dupSection.style.display = 'block';
        btnConfirm.style.display = 'inline-block';
        dupContainer.innerHTML = duplicateGroups.map(group => `
            <div style="margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #ccc;">
                <div style="font-weight:bold; color:#333; margin-bottom:4px;">輸入名稱：「${group.query}」</div>
                ${group.candidates.map(c => `
                    <label style="display:flex; align-items:center; gap:8px; padding:4px 6px; cursor:pointer; font-size:14px;">
                        <input type="checkbox" class="dup-select-cb" value="${c.studentNumber}">
                        <span class="badge-num">${c.studentNumber}</span>
                        <b>${c.name}</b>
                        <span class="badge-class">${c.homeroom ? `${c.homeroom} (${c.seatNo}號)` : '未分班'}</span>
                    </label>
                `).join('')}
            </div>
        `).join('');
    } else {
        dupSection.style.display = 'none';
        btnConfirm.style.display = 'none';
    }

    const nfSection = document.getElementById('notFoundSection');
    const nfContainer = document.getElementById('notFoundListContainer');
    if (notFound.length > 0) {
        nfSection.style.display = 'block';
        nfContainer.innerText = notFound.join('、');
    } else {
        nfSection.style.display = 'none';
    }

    document.getElementById('resolveConflictModal').style.display = 'flex';
}

async function confirmDuplicateSelection() {
    const checked = document.querySelectorAll('.dup-select-cb:checked');
    if (checked.length === 0) return alert("請至少勾選一位學生，或點擊「關閉」離開。");

    const selectedStudents = Array.from(checked)
        .map(cb => masterStudents[cb.value])
        .filter(Boolean);

    const result = await batchInsertStudentsToClass(selectedStudents);
    closeResolveModal();

    let msg = `✅ 成功補加入 ${result.added} 位同名學生！`;
    if (result.skipped > 0) msg += `\n（另有 ${result.skipped} 位原本就在本班，已略過）`;
    alert(msg);
}

initPage();