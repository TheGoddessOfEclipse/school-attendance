window.addEventListener('DOMContentLoaded', async () => {
    const tbody = document.getElementById('queryTableBody');

    try {
        const snap = await window.db.ref('/').once('value');
        const allData = snap.val() || {};
        const scheduleCfg = allData.scheduleConfig || {};
        const periodNameMap = {};

        ['weekday', 'weekend'].forEach(type => {
            if (Array.isArray(scheduleCfg[type])) {
                scheduleCfg[type].forEach(p => {
                    if (p && p.id) periodNameMap[p.id] = p.name;
                });
            }
        });

        let records = [];

        for (let key in allData) {
            if (key.startsWith('attendance_') && key !== 'attendance_meta') {
                const date = key.replace('attendance_', '');
                const dailyData = allData[key] || {};
                const metaDate = allData['attendance_meta']?.[date] || {};

                for (let periodId in dailyData) {
                    const periodNode = dailyData[periodId];
                    if (!periodNode || typeof periodNode !== 'object') continue;

                    for (let cat in periodNode) {
                        const catNode = periodNode[cat];
                        if (!catNode || typeof catNode !== 'object' || Array.isArray(catNode)) continue;

                        for (let cls in catNode) {
                            const rawList = catNode[cls];
                            if (!Array.isArray(rawList)) continue;

                            const students = rawList.filter(s => s && s.id !== '_placeholder');
                            if (students.length === 0) continue;

                            const hasRecord = students.some(s => s.status && s.status !== "未點名");
                            if (!hasRecord) continue;

                            const total = students.length;
                            const presentCount = students.filter(s => s.status === '出席' || s.status === '部分出席').length;
                            const rate = total === 0 ? 0 : Math.round((presentCount / total) * 100);

                            const absentStudents = students.filter(s => s.status !== '出席' && s.status !== '部分出席' && s.status !== '未點名');
                            const absentText = absentStudents.length > 0
                                ? absentStudents.map(s => `${s.name}(${s.status})`).join(', ')
                                : '<span style="color:#58d68d; font-weight:bold;">全勤 🎉</span>';

                            const metaEntry = metaDate?.[periodId]?.[cat]?.[cls];
                            const updatedTs = (metaEntry && typeof metaEntry === 'object') ? metaEntry.updatedAt : (typeof metaEntry === 'number' ? metaEntry : 0);
                            const periodName = (metaEntry && metaEntry.periodName) || periodNameMap[periodId] || periodId;

                            const lastUpdated = updatedTs
                                ? new Date(updatedTs).toLocaleString()
                                : '<span style="color:#7f8c8d;">無時間紀錄</span>';

                            records.push({
                                date,
                                periodId,
                                periodName,
                                category: cat,
                                className: cls,
                                lastUpdated,
                                updatedTs,
                                rate,
                                absentText
                            });
                        }
                    }
                }
            }
        }

        // 依日期與最後更新時間由新到舊排序
        records.sort((a, b) => {
            const dCmp = b.date.localeCompare(a.date);
            if (dCmp !== 0) return dCmp;
            return (b.updatedTs || 0) - (a.updatedTs || 0);
        });

        tbody.innerHTML = '';
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="color:#aeb9b6; padding:24px;">目前尚無節次制點名紀錄。</td></tr>';
            return;
        }

        records.forEach(r => {
            const barColor = r.rate >= 90 ? 'bar-green' : (r.rate >= 70 ? 'bar-yellow' : 'bar-red');
            const link = `admin.html?date=${r.date}&period=${encodeURIComponent(r.periodId)}&category=${encodeURIComponent(r.category)}&class=${encodeURIComponent(r.className)}`;

            tbody.innerHTML += `
                <tr>
                    <td><b>${r.date}</b></td>
                    <td><span style="color:#ebd29b; font-weight:bold;">${r.periodName}</span></td>
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
        tbody.innerHTML = '<tr><td colspan="8" style="color:#ff8a80; padding:24px;">資料載入失敗，請檢查連線。</td></tr>';
    }
});