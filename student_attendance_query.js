let masterStudents = {};
let periodMetaMap = {}; // { periodId: { name, order } }
let selectedStudent = null;
let lastQueryResults = [];
let lastQueryMeta = { startDate: '', endDate: '', stats: {} };

function formatDateYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function initQueryPage() {
    // 預設查詢區間：本月 1 號 ～ 今天
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('startDateInput').value = formatDateYMD(firstDay);
    document.getElementById('endDateInput').value = formatDateYMD(today);

    const [stuSnap, schSnap] = await Promise.all([
        window.db.ref('students').once('value'),
        window.db.ref('scheduleConfig').once('value')
    ]);

    masterStudents = stuSnap.val() || {};
    const sch = schSnap.val() || {};
    ['weekday', 'weekend'].forEach(type => {
        if (Array.isArray(sch[type])) {
            sch[type].forEach((p, idx) => {
                if (p && p.id) periodMetaMap[p.id] = { name: p.name, order: idx };
            });
        }
    });
}

// ==================== 1. 學生搜尋下拉 ====================
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

    document.getElementById('selStuText').innerHTML =
        `<span class="badge-num">${stu.studentNumber}</span> <b>${stu.name}</b> <span class="badge-class">${stu.homeroom ? `${stu.homeroom} (${stu.seatNo}號)` : '未分班'}</span>`;
    document.getElementById('selectedStuPill').style.display = 'inline-flex';
}

function clearSelectedStudent() {
    selectedStudent = null;
    document.getElementById('selectedStuPill').style.display = 'none';
    document.getElementById('summaryGrid').style.display = 'none';
    document.getElementById('btnExportPdf').style.display = 'none';
    document.getElementById('resultTableBody').innerHTML =
        '<tr><td colspan="6" style="color:#aeb9b6; padding:28px;">請先選擇學生與日期區間，再點擊「🔍 開始查詢」</td></tr>';
}

// ==================== 2. 區間查詢邏輯 ====================
function getDatesInRange(startStr, endStr) {
    const dates = [];
    let curr = new Date(`${startStr}T00:00:00`);
    const end = new Date(`${endStr}T00:00:00`);
    while (curr <= end) {
        dates.push(formatDateYMD(curr));
        curr.setDate(curr.getDate() + 1);
    }
    return dates;
}

async function runStudentQuery() {
    if (!selectedStudent) return alert("⚠️ 請先選擇要查詢的學生！");

    const startDate = document.getElementById('startDateInput').value;
    const endDate = document.getElementById('endDateInput').value;
    if (!startDate || !endDate) return alert("⚠️ 請選擇完整的起訖日期！");
    if (startDate > endDate) return alert("⚠️ 開始日期不可晚於結束日期！");

    const dates = getDatesInRange(startDate, endDate);
    if (dates.length > 366) return alert("⚠️ 單次查詢區間請勿超過 1 年（366 天）！");

    const tbody = document.getElementById('resultTableBody');
    const btn = document.getElementById('btnRunQuery');
    btn.disabled = true;
    btn.innerText = '⏳ 查詢中...';
    tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;">⏳ 正在彙整該生差勤紀錄...</td></tr>';

    const fallbackId = selectedStudent.homeroom ? `${selectedStudent.homeroom}-${selectedStudent.seatNo}` : selectedStudent.studentNumber;

    try {
        // 平行抓取區間內每一天的節次點名資料
        const snaps = await Promise.all(
            dates.map(d => window.db.ref(`attendance_${d}`).once('value').then(s => ({ date: d, val: s.val() })))
        );

        const records = [];

        snaps.forEach(({ date, val }) => {
            if (!val || typeof val !== 'object') return;

            for (const periodId in val) {
                const periodNode = val[periodId];
                if (!periodNode || typeof periodNode !== 'object') continue;

                const pMeta = periodMetaMap[periodId] || { name: periodId, order: 99 };

                for (const cat in periodNode) {
                    const catNode = periodNode[cat];
                    if (!catNode || typeof catNode !== 'object' || Array.isArray(catNode)) continue;

                    for (const cls in catNode) {
                        const list = catNode[cls];
                        if (!Array.isArray(list)) continue;

                        const found = list.find(s =>
                            s && s.id !== '_placeholder' &&
                            (s.studentNumber === selectedStudent.studentNumber || s.id === fallbackId)
                        );

                        if (found && found.status && found.status !== '未點名') {
                            records.push({
                                date,
                                periodId,
                                periodName: pMeta.name,
                                periodOrder: pMeta.order,
                                category: cat,
                                className: cls,
                                status: found.status,
                                reason: found.reason || '',
                                note: found.note || '',
                                timeIn: found.timeIn || '',
                                timeOut: found.timeOut || '',
                                updatedBy: found.updatedBy || '-'
                            });
                        }
                    }
                }
            }
        });

        // 依日期由舊到新、同日依節次順序排列（方便檢視與列印）
        records.sort((a, b) => {
            const dCmp = a.date.localeCompare(b.date);
            if (dCmp !== 0) return dCmp;
            return (a.periodOrder ?? 99) - (b.periodOrder ?? 99);
        });

        // 統計各項次數
        const stats = {
            total: records.length,
            present: records.filter(r => r.status === '出席').length,
            leave: records.filter(r => ['病假', '事假', '喪假', '因故缺席'].includes(r.status)).length,
            partial: records.filter(r => r.status === '部分出席').length,
            absent: records.filter(r => r.status === '無故缺席').length
        };

        lastQueryResults = records;
        lastQueryMeta = { startDate, endDate, stats };

        document.getElementById('sumTotal').innerText = stats.total;
        document.getElementById('sumPresent').innerText = stats.present;
        document.getElementById('sumLeave').innerText = stats.leave;
        document.getElementById('sumPartial').innerText = stats.partial;
        document.getElementById('sumAbsent').innerText = stats.absent;
        document.getElementById('summaryGrid').style.display = 'grid';
        document.getElementById('btnExportPdf').style.display = records.length > 0 ? 'inline-flex' : 'none';

        if (records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="color:#aeb9b6; padding:28px;">${selectedStudent.name} 於 ${startDate} ～ ${endDate} 期間尚無點名紀錄。</td></tr>`;
            return;
        }

        tbody.innerHTML = records.map(r => {
            let stClass = 'st-present';
            if (r.status === '無故缺席') stClass = 'st-absent';
            else if (r.status === '部分出席') stClass = 'st-partial';
            else if (['病假', '事假', '喪假', '因故缺席'].includes(r.status)) stClass = 'st-leave';

            const details = [];
            if (r.status === '部分出席' && (r.timeIn || r.timeOut)) details.push(`時間：${r.timeIn || '--:--'}~${r.timeOut || '--:--'}`);
            if (r.reason) details.push(`原因：${r.reason}`);
            if (r.note) details.push(`備註：${r.note}`);

            return `
                <tr>
                    <td style="font-family:monospace; color:#ebd29b; font-weight:bold;">${r.date}</td>
                    <td><b>${r.periodName}</b></td>
                    <td>${r.className} <small style="color:#aeb9b6;">(${r.category})</small></td>
                    <td><span class="status-badge ${stClass}">${r.status}</span></td>
                    <td style="text-align:left; color:#e6ecea;">${details.join(' ｜ ') || '-'}</td>
                    <td>${r.updatedBy}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error("查詢差勤失敗：", err);
        tbody.innerHTML = '<tr><td colspan="6" style="color:#ff8a80; padding:24px;">查詢失敗，請檢查網路連線。</td></tr>';
    } finally {
        btn.disabled = false;
        btn.innerText = '🔍 開始查詢';
    }
}

// ==================== 3. 友善列印 / 一鍵產出 PDF ====================
function exportStudentAttendancePDF() {
    if (!selectedStudent || lastQueryResults.length === 0) {
        return alert("目前沒有可列印的查詢結果！");
    }

    const { startDate, endDate, stats } = lastQueryMeta;
    const exportTime = new Date().toLocaleString();

    const rowsHtml = lastQueryResults.map((r, idx) => {
        const details = [];
        if (r.status === '部分出席' && (r.timeIn || r.timeOut)) details.push(`時間：${r.timeIn || '--:--'}~${r.timeOut || '--:--'}`);
        if (r.reason) details.push(`原因：${r.reason}`);
        if (r.note) details.push(`備註：${r.note}`);

        return `
            <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="text-align:center; font-family:monospace;">${r.date}</td>
                <td style="text-align:center;">${r.periodName}</td>
                <td style="text-align:center;">${r.className}（${r.category}）</td>
                <td style="text-align:center; font-weight:bold;">${r.status}</td>
                <td>${details.join(' ｜ ') || '-'}</td>
                <td style="text-align:center;">${r.updatedBy}</td>
            </tr>
        `;
    }).join('');

    const printWin = window.open('', '_blank', 'width=960,height=720');
    printWin.document.write(`
        <!DOCTYPE html>
        <html lang="zh-TW">
        <head>
            <meta charset="UTF-8">
            <title>${selectedStudent.name} 差勤紀錄表 (${startDate} ~ ${endDate})</title>
            <style>
                body { font-family: 'Microsoft JhengHei', sans-serif; padding: 20px; color: #222; }
                h2 { text-align: center; margin: 0 0 6px 0; font-size: 20px; }
                .subtitle { text-align: center; font-size: 13px; color: #444; margin-bottom: 14px; }
                .info-box { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 13px; border: 1px solid #999; background: #f8f9fa; padding: 10px 14px; margin-bottom: 12px; }
                .stats-line { font-size: 13px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1.5px solid #333; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th, td { border: 1px solid #888; padding: 6px 8px; word-break: break-word; }
                th { background: #eaeaea; }
                thead { display: table-header-group; }
                tr { page-break-inside: avoid; }
                @media print {
                    body { padding: 0; }
                    @page { size: A4 portrait; margin: 12mm; }
                }
            </style>
        </head>
        <body>
            <h2>石榴科技實驗學校 — 學生個人差勤紀錄表</h2>
            <div class="subtitle">查詢期間：${startDate} 至 ${endDate}</div>
            <div class="info-box">
                <span><b>學號：</b>${selectedStudent.studentNumber}</span>
                <span><b>姓名：</b>${selectedStudent.name}</span>
                <span><b>原班級：</b>${selectedStudent.homeroom ? `${selectedStudent.homeroom}（${selectedStudent.seatNo}號）` : '未分班'}</span>
                <span><b>製表時間：</b>${exportTime}</span>
            </div>
            <div class="stats-line">
                <span><b>總計節數：</b>${stats.total} 節</span>
                <span><b>出席：</b>${stats.present}</span>
                <span><b>各類請假：</b>${stats.leave}</span>
                <span><b>部分出席：</b>${stats.partial}</span>
                <span><b>無故缺席：</b>${stats.absent}</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width:5%;">#</th>
                        <th style="width:13%;">日期</th>
                        <th style="width:11%;">節次</th>
                        <th style="width:18%;">班級（班種）</th>
                        <th style="width:11%;">狀態</th>
                        <th style="width:30%;">原因 / 時間 / 備註</th>
                        <th style="width:12%;">登記人員</th>
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

initQueryPage();