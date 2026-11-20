window.addEventListener('DOMContentLoaded', async () => {
    const tbody = document.getElementById('queryTableBody');

    try {
        // 抓取雲端所有資料
        let snap = await window.db.ref('/').once('value');
        let allData = snap.val() || {};
        let records = [];

        for (let key in allData) {
            // 找出所有的點名日期節點
            if (key.startsWith('attendance_') && key !== 'attendance_meta') {
                let date = key.replace('attendance_', '');
                let dailyData = allData[key];
                let metaData = allData['attendance_meta'] ? allData['attendance_meta'][date] : {};

                for (let cat in dailyData) {
                    for (let cls in dailyData[cat]) {
                        // 濾除假資料
                        let students = dailyData[cat][cls].filter(s => s.id !== '_placeholder');
                        if (students.length === 0) continue;

                        // 判定標準：只要有一人狀態不是「未點名」，就視為有這筆紀錄
                        let hasRecord = students.some(s => s.status !== "未點名");
                        if (hasRecord) {
                            let total = students.length;
                            let presentCount = students.filter(s => s.status === '出席' || s.status === '部分出席').length;
                            let rate = total === 0 ? 0 : Math.round((presentCount / total) * 100);

                            // 整理未到清單
                            let absentStudents = students.filter(s => s.status !== '出席' && s.status !== '部分出席' && s.status !== '未點名');
                            let absentText = absentStudents.length > 0
                                ? absentStudents.map(s => `${s.name}(${s.status})`).join(', ')
                                : '<span style="color:#58d68d; font-weight:bold;">全勤 🎉</span>';

                            // 取得最後更新時間
                            let lastUpdated = metaData && metaData[cat] && metaData[cat][cls]
                                ? new Date(metaData[cat][cls]).toLocaleString()
                                : '<span style="color:#7f8c8d;">無時間紀錄</span>';

                            records.push({ date, category: cat, className: cls, lastUpdated, rate, absentText });
                        }
                    }
                }
            }
        }

        // 以日期反向排序 (最新的在最上面)
        records.sort((a, b) => b.date.localeCompare(a.date));

        tbody.innerHTML = '';
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="color:#aeb9b6; padding:24px;">目前尚無任何點名紀錄。</td></tr>';
            return;
        }

        records.forEach(r => {
            let barColor = r.rate >= 90 ? 'bar-green' : (r.rate >= 70 ? 'bar-yellow' : 'bar-red');
            let link = `admin.html?date=${r.date}&category=${encodeURIComponent(r.category)}&class=${encodeURIComponent(r.className)}`;

            tbody.innerHTML += `
                <tr>
                    <td><b>${r.date}</b></td>
                    <td>${r.category}</td>
                    <td><b>${r.className}</b></td>
                    <td>${r.lastUpdated}</td>
                    <td>
                        <div class="progress-bg">
                            <div class="progress-bar ${barColor}" style="width: ${r.rate}%;"></div>
                            <span class="progress-text">${r.rate}%</span>
                        </div>
                    </td>
                    <td><div class="absent-list">${r.absentText}</div></td>
                    <td><a href="${link}" class="btn-go">🔗 查看</a></td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("讀取失敗:", error);
        tbody.innerHTML = '<tr><td colspan="7" style="color:#ff8a80; padding:24px;">資料載入失敗，請檢查連線。</td></tr>';
    }
});