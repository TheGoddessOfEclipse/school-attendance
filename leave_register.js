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

let masterStudents = {};
let rosterTemplate = {};
let scheduleConfig = { weekday: DEFAULT_SCHEDULE.weekday, weekend: DEFAULT_SCHEDULE.weekend };
let selectedStudent = null;
let selectedLeaveType = '病假';
let currentTeacherName = '';

function getLocalTodayDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) return;
    try {
        const snap = await window.db.ref(`users/${user.uid}/name`).once('value');
        currentTeacherName = snap.val() || user.displayName || user.email || '老師';
    } catch (_) {
        currentTeacherName = user.displayName || user.email || '老師';
    }
});

async function initLeavePage() {
    document.getElementById('leaveDateInput').value = getLocalTodayDate();

    const [stuSnap, tplSnap, schSnap] = await Promise.all([
        window.db.ref('students').once('value'),
        window.db.ref('rosterTemplate').once('value'),
        window.db.ref('scheduleConfig').once('value')
    ]);

    masterStudents = stuSnap.val() || {};
    rosterTemplate = tplSnap.val() || {};

    const schVal = schSnap.val();
    if (schVal) {
        scheduleConfig.weekday = Array.isArray(schVal.weekday) && schVal.weekday.length > 0 ? schVal.weekday.filter(Boolean) : DEFAULT_SCHEDULE.weekday;
        scheduleConfig.weekend = Array.isArray(schVal.weekend) && schVal.weekend.length > 0 ? schVal.weekend.filter(Boolean) : DEFAULT_SCHEDULE.weekend;
    }

    renderPeriodsForDate();
}

// ==================== 1. 學生即時搜尋 ====================
const searchInput = document.getElementById('stuSearchInput');
const searchDropdown = document.getElementById('stuSearchDropdown');

searchInput.addEventListener('input', () => {
    const kw = searchInput.value.trim().toLowerCase();
    if (!kw) {
        searchDropdown.style.display = 'none';
        return;
    }

    const matches = Object.values(masterStudents).filter(s =>
        (s.studentNumber && s.studentNumber.toLowerCase().includes(kw)) ||
        (s.name && s.name.toLowerCase().includes(kw)) ||
        (s.homeroom && s.homeroom.toLowerCase().includes(kw))
    ).slice(0, 15);

    if (matches.length === 0) {
        searchDropdown.innerHTML = '<div style="color:#ff8a80; justify-content:center; cursor:default;">找不到相符的學生</div>';
    } else {
        searchDropdown.innerHTML = matches.map(s => `
            <div onclick="chooseStudent('${s.studentNumber}')">
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

function chooseStudent(studentNumber) {
    const stu = masterStudents[studentNumber];
    if (!stu) return;

    selectedStudent = stu;
    searchInput.value = '';
    searchDropdown.style.display = 'none';

    document.getElementById('selStuNum').innerText = stu.studentNumber;
    document.getElementById('selStuName').innerText = stu.name;
    document.getElementById('selStuHome').innerText = stu.homeroom ? `${stu.homeroom} (${stu.seatNo}號)` : '未分班';
    document.getElementById('selectedStudentCard').style.display = 'flex';

    renderStudentClasses(stu);
}

function clearSelectedStudent() {
    selectedStudent = null;
    document.getElementById('selectedStudentCard').style.display = 'none';
    document.getElementById('studentClassesGrid').innerHTML =
        '<div style="color:#aeb9b6; font-size:13px;">請先於步驟 1 選擇學生，系統會自動帶出該生所有班級與社團。</div>';
    searchInput.focus();
}

// ==================== 2. 動態列出該生所屬班級與節次 ====================
function renderStudentClasses(stu) {
    const container = document.getElementById('studentClassesGrid');
    const memberships = [];
    const fallbackId = stu.homeroom ? `${stu.homeroom}-${stu.seatNo}` : stu.studentNumber;

    for (const cat in rosterTemplate) {
        for (const cls in rosterTemplate[cat]) {
            const list = rosterTemplate[cat][cls];
            if (!Array.isArray(list)) continue;
            const found = list.some(item =>
                item && item.id !== '_placeholder' &&
                (item.studentNumber === stu.studentNumber || item.id === fallbackId)
            );
            if (found) {
                memberships.push({ category: cat, className: cls });
            }
        }
    }

    if (memberships.length === 0) {
        container.innerHTML = '<div style="color:#ff8a80; font-size:13px;">此學生目前尚未加入任何班級或社團。</div>';
        return;
    }

    container.innerHTML = memberships.map(m => `
        <label class="check-chip">
            <input type="checkbox" class="cls-opt" data-cat="${m.category}" data-cls="${m.className}" checked>
            <div>
                <strong>${m.className}</strong>
                <small>${m.category}</small>
            </div>
        </label>
    `).join('');
}

function renderPeriodsForDate() {
    const dateStr = document.getElementById('leaveDateInput').value;
    const d = new Date(`${dateStr}T00:00:00`);
    const day = isNaN(d.getTime()) ? new Date().getDay() : d.getDay();
    const periods = (day === 0 || day === 6) ? scheduleConfig.weekend : scheduleConfig.weekday;

    const container = document.getElementById('periodCheckboxGrid');
    container.innerHTML = periods.map(p => `
        <label class="check-chip">
            <input type="checkbox" class="period-opt" value="${p.id}" data-name="${p.name}">
            <div>
                <strong>${p.name}</strong>
                <small>${p.start} ~ ${p.end}</small>
            </div>
        </label>
    `).join('');
}

function toggleAllPeriods(checked) {
    document.querySelectorAll('.period-opt').forEach(cb => cb.checked = checked);
}

function toggleAllClasses(checked) {
    document.querySelectorAll('.cls-opt').forEach(cb => cb.checked = checked);
}

// ==================== 3. 假別選擇與送出寫入 ====================
function selectLeaveType(type) {
    selectedLeaveType = type;
    document.querySelectorAll('.leave-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    document.getElementById('reasonWrap').style.display = (type === '因故缺席') ? 'block' : 'none';
}

async function submitLeaveRegistration() {
    if (!selectedStudent) return alert("⚠️ 請先選擇要請假的學生！");

    const date = document.getElementById('leaveDateInput').value;
    if (!date) return alert("⚠️ 請選擇請假日期！");

    const selectedPeriods = Array.from(document.querySelectorAll('.period-opt:checked')).map(cb => ({
        id: cb.value,
        name: cb.dataset.name
    }));
    if (selectedPeriods.length === 0) return alert("⚠️ 請至少勾選一節課！");

    const selectedClasses = Array.from(document.querySelectorAll('.cls-opt:checked')).map(cb => ({
        category: cb.dataset.cat,
        className: cb.dataset.cls
    }));
    if (selectedClasses.length === 0) return alert("⚠️ 請至少勾選一個課程／班級！");

    const reason = (selectedLeaveType === '因故缺席') ? document.getElementById('leaveReasonInput').value.trim() : '';
    const note = document.getElementById('leaveNoteInput').value.trim();

    const btn = document.getElementById('btnSubmitLeave');
    btn.disabled = true;
    btn.innerText = '⏳ 寫入登記中...';

    const nowTs = Date.now();
    const teacherName = currentTeacherName || document.getElementById('navUserName')?.innerText || '老師';
    const fallbackId = selectedStudent.homeroom ? `${selectedStudent.homeroom}-${selectedStudent.seatNo}` : selectedStudent.studentNumber;

    try {
        for (const period of selectedPeriods) {
            for (const clsObj of selectedClasses) {
                const path = `attendance_${date}/${period.id}/${clsObj.category}/${clsObj.className}`;
                const snap = await window.db.ref(path).once('value');
                let list = snap.val();

                // 若該節次尚未建立點名表，從 rosterTemplate 初始化
                if (!Array.isArray(list)) {
                    const tplList = rosterTemplate?.[clsObj.category]?.[clsObj.className] || [];
                    list = tplList
                        .filter(s => s && s.id !== '_placeholder')
                        .map(s => ({ ...s, status: '未點名', reason: '', note: '', timeIn: '', timeOut: '' }));
                }

                let updated = false;
                list.forEach(s => {
                    if (!s || s.id === '_placeholder') return;
                    if (s.studentNumber === selectedStudent.studentNumber || s.id === fallbackId) {
                        s.status = selectedLeaveType;
                        s.reason = reason;
                        s.note = note;
                        s.timeIn = '';
                        s.timeOut = '';
                        s.updatedBy = teacherName;
                        s.updatedAt = nowTs;
                        s.isAutoSynced = false;
                        updated = true;
                    }
                });

                if (updated) {
                    await window.db.ref(path).set(list);
                    await window.db.ref(`attendance_meta/${date}/${period.id}/${clsObj.category}/${clsObj.className}`).set({
                        updatedAt: nowTs,
                        periodName: period.name
                    });
                }
            }
        }

        // 寫入行政後台操作活動紀錄
        if (typeof logActivity === 'function') {
            const periodNames = selectedPeriods.map(p => p.name).join('、');
            const classNames = selectedClasses.map(c => c.className).join('、');
            let detail = `幫學生 ${selectedStudent.studentNumber} ${selectedStudent.name} 登記 [${date}] ${periodNames}（${classNames}）為「${selectedLeaveType}」`;
            if (reason) detail += ` (原因:${reason})`;
            if (note) detail += ` (備註:${note})`;
            await logActivity('請假登記', detail);
        }

        alert(`✅ 已完成 ${selectedStudent.name} 的「${selectedLeaveType}」登記！\n共更新 ${selectedPeriods.length} 個節次 × ${selectedClasses.length} 個班級，並已同步至點名表與操作紀錄。`);

        // 清空勾選與備註方便登記下一位
        toggleAllPeriods(false);
        document.getElementById('leaveReasonInput').value = '';
        document.getElementById('leaveNoteInput').value = '';
    } catch (err) {
        console.error("請假登記失敗：", err);
        alert("登記失敗，請檢查網路連線！");
    } finally {
        btn.disabled = false;
        btn.innerText = '💾 送出請假登記';
    }
}

initLeavePage();