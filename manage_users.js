let allLogs = [];
let filteredLogs = [];
let displayLimit = 100;
let myCurrentUid = null;

// 取得目前登入者 UID（供防呆判斷）
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        myCurrentUid = user.uid;
        initUsersListener();
        initLogsListener();
    }
});

// ================= 1. 帳號審核與管理 =================
function initUsersListener() {
    window.db.ref('users').on('value', (snap) => {
        const usersObj = snap.val() || {};
        const list = Object.values(usersObj).sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            return (b.createdAt || 0) - (a.createdAt || 0);
        });

        // 更新 KPI
        document.getElementById('kpiTotalUsers').innerText = list.length;
        document.getElementById('kpiPendingUsers').innerText = list.filter(u => u.status === 'pending').length;

        const tbody = document.getElementById('userTableBody');
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">目前尚無註冊帳號</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(u => {
            const isSelf = (u.uid === myCurrentUid);
            const roleBadge = u.role === 'admin'
                ? '<span class="badge badge-admin">行政管理員</span>'
                : '<span class="badge badge-teacher">教師</span>';
            const statusBadge = u.status === 'approved'
                ? '<span class="badge badge-approved">已核准</span>'
                : '<span class="badge badge-pending">待審核</span>';

            let actionHtml = '';
            if (isSelf) {
                actionHtml = '<button class="btn-disabled" disabled>🔒 目前登入帳號</button>';
            } else {
                if (u.status !== 'approved') {
                    actionHtml += `<button class="btn-approve" onclick="approveUser('${u.uid}', '${u.name}')">✅ 核准</button>`;
                } else {
                    actionHtml += `<button class="btn-role" onclick="toggleRole('${u.uid}', '${u.role}', '${u.name}')">🔄 切換角色</button>`;
                }
                actionHtml += `<button class="btn-delete" onclick="deleteUser('${u.uid}', '${u.name}')">🗑️ 移除</button>`;
            }

            return `
                <tr>
                    <td style="font-weight:bold;">
                        ${u.name}${isSelf ? '<span class="badge badge-self">本人</span>' : ''}
                    </td>
                    <td style="font-size:13px; color:#555;">${u.email}</td>
                    <td>${roleBadge}</td>
                    <td>${statusBadge}</td>
                    <td class="action-btns">${actionHtml}</td>
                </tr>
            `;
        }).join('');
    });
}

async function approveUser(uid, name) {
    await window.db.ref(`users/${uid}/status`).set('approved');
    await logActivity('帳號審核', `核准了「${name}」的系統帳號申請`);
}

async function toggleRole(uid, currentRole, name) {
    const nextRole = currentRole === 'admin' ? 'teacher' : 'admin';
    const nextLabel = nextRole === 'admin' ? '行政管理員' : '教師';
    if (!confirm(`確定要將「${name}」的角色切換為「${nextLabel}」嗎？`)) return;

    await window.db.ref(`users/${uid}/role`).set(nextRole);
    await logActivity('帳號審核', `將「${name}」的系統角色更改為「${nextLabel}」`);
}

async function deleteUser(uid, name) {
    if (!confirm(`⚠️ 確定要移除「${name}」的帳號與系統存取權限嗎？`)) return;

    await window.db.ref(`users/${uid}`).remove();
    await logActivity('帳號審核', `移除了「${name}」的系統帳號`);
}

// ================= 2. 操作活動紀錄與篩選 =================
function initLogsListener() {
    window.db.ref('activityLogs').orderByChild('timestamp').on('value', (snap) => {
        const raw = snap.val() || {};
        // 轉陣列並依時間新到舊排序
        allLogs = Object.values(raw).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        // 計算今日操作數
        const startOfToday = getStartTimestamp('today');
        const todayCount = allLogs.filter(l => l.timestamp >= startOfToday).length;
        document.getElementById('kpiTodayLogs').innerText = todayCount;

        updateUserFilterDropdown();
        renderLogs();
    });
}

function updateUserFilterDropdown() {
    const select = document.getElementById('filterUser');
    const prevVal = select.value;
    const uniqueNames = [...new Set(allLogs.map(l => l.userName).filter(Boolean))].sort();

    select.innerHTML = '<option value="all">👤 所有人員</option>' +
        uniqueNames.map(name => `<option value="${name}">${name}</option>`).join('');

    if (uniqueNames.includes(prevVal)) select.value = prevVal;
}

function getStartTimestamp(range) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    switch (range) {
        case 'today':
            return startOfToday;
        case '3days':
            // 包含今天在內的近三天（前天 00:00 起）
            return startOfToday - (2 * 24 * 60 * 60 * 1000);
        case 'week': {
            // 本週一 00:00 起
            const day = now.getDay(); // 0=日, 1=一 ... 6=六
            const diffToMon = (day === 0 ? 6 : day - 1);
            return startOfToday - (diffToMon * 24 * 60 * 60 * 1000);
        }
        case 'month':
            return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        case 'year':
            return new Date(now.getFullYear(), 0, 1).getTime();
        default:
            return 0;
    }
}

function formatDateTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function resetAndRenderLogs() {
    displayLimit = 100;
    renderLogs();
}

function loadMoreLogs() {
    displayLimit += 100;
    renderLogs();
}

function renderLogs() {
    const timeRange = document.getElementById('filterTime').value;
    const userFilter = document.getElementById('filterUser').value;
    const actionFilter = document.getElementById('filterAction').value;
    const keyword = document.getElementById('filterKeyword').value.trim().toLowerCase();
    const minTs = getStartTimestamp(timeRange);

    filteredLogs = allLogs.filter(log => {
        if (log.timestamp < minTs) return false;
        if (userFilter !== 'all' && log.userName !== userFilter) return false;
        if (actionFilter !== 'all' && log.action !== actionFilter) return false;
        if (keyword) {
            const hay = `${log.userName} ${log.action} ${log.details}`.toLowerCase();
            if (!hay.includes(keyword)) return false;
        }
        return true;
    });

    const visibleLogs = filteredLogs.slice(0, displayLimit);
    const tbody = document.getElementById('logTableBody');
    const infoEl = document.getElementById('logCountInfo');
    const loadMoreWrap = document.getElementById('loadMoreWrap');

    infoEl.innerText = `符合條件共 ${filteredLogs.length} 筆，目前顯示最新 ${visibleLogs.length} 筆`;

    if (visibleLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:#7f8c8d; padding:24px;">查無符合條件的操作紀錄</td></tr>';
        loadMoreWrap.style.display = 'none';
        return;
    }

    tbody.innerHTML = visibleLogs.map(log => `
        <tr>
            <td style="font-family:monospace; font-size:13px; color:#555;">${formatDateTime(log.timestamp)}</td>
            <td style="font-weight:bold;">${log.userName || '未知'}</td>
            <td><span class="badge-action">${log.action || '系統操作'}</span></td>
            <td class="text-left">${log.details || ''}</td>
        </tr>
    `).join('');

    loadMoreWrap.style.display = (filteredLogs.length > displayLimit) ? 'block' : 'none';
}

// ================= 3. 產出 PDF 報表 =================
function exportLogsToPDF() {
    if (filteredLogs.length === 0) {
        return alert("目前篩選條件下沒有任何紀錄可匯出！");
    }

    const timeSelect = document.getElementById('filterTime');
    const timeText = timeSelect.options[timeSelect.selectedIndex].text;
    const userText = document.getElementById('filterUser').value === 'all' ? '所有人員' : document.getElementById('filterUser').value;
    const actionText = document.getElementById('filterAction').value === 'all' ? '所有動作' : document.getElementById('filterAction').value;
    const exportTime = formatDateTime(Date.now());

    const rowsHtml = filteredLogs.map((log, idx) => `
        <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td style="font-family:monospace; text-align:center;">${formatDateTime(log.timestamp)}</td>
            <td style="text-align:center; font-weight:bold;">${log.userName || ''}</td>
            <td style="text-align:center;">${log.action || ''}</td>
            <td>${log.details || ''}</td>
        </tr>
    `).join('');

    const printWin = window.open('', '_blank', 'width=960,height=700');
    printWin.document.write(`
        <!DOCTYPE html>
        <html lang="zh-TW">
        <head>
            <meta charset="UTF-8">
            <title>石榴科技實驗學校 - 系統操作活動報表</title>
            <style>
                body { font-family: 'Microsoft JhengHei', sans-serif; padding: 20px; color: #222; }
                h2 { text-align: center; margin: 0 0 6px 0; font-size: 20px; }
                .subtitle { text-align: center; font-size: 13px; color: #555; margin-bottom: 16px; }
                .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 12px; border-bottom: 1.5px solid #333; padding-bottom: 6px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th, td { border: 1px solid #999; padding: 6px 8px; word-break: break-word; }
                th { background: #eee; }
                thead { display: table-header-group; }
                tr { page-break-inside: avoid; }
                @media print {
                    body { padding: 0; }
                    @page { size: A4 portrait; margin: 12mm; }
                }
            </style>
        </head>
        <body>
            <h2>石榴科技實驗學校 線上點名系統 — 操作活動紀錄報表</h2>
            <div class="subtitle">篩選條件：時間【${timeText}】｜人員【${userText}】｜動作【${actionText}】</div>
            <div class="meta">
                <span>總計筆數：${filteredLogs.length} 筆</span>
                <span>報表產出時間：${exportTime}</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width:6%;">#</th>
                        <th style="width:20%;">操作時間</th>
                        <th style="width:14%;">操作人員</th>
                        <th style="width:14%;">執行動作</th>
                        <th style="width:46%;">操作詳情</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            <script>
                window.onload = function() {
                    window.print();
                };
            <\/script>
        </body>
        </html>
    `);
    printWin.document.close();
}