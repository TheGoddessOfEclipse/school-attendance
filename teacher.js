async function initSystem() {
    try {
        let snap = await window.db.ref('rosterTemplate').once('value');
        if (!snap.exists()) {
            await window.db.ref('rosterTemplate').set({"周間普通班": {}});
        }
        document.getElementById('dateSelect').value = new Date().toISOString().split('T')[0];
    } catch (error) {
        console.error("Firebase 連線錯誤:", error);
        alert("無法連線到雲端資料庫，請確認設定！");
    }
}
initSystem();

let currentCategory = "";

async function selectCategory(category) {
    currentCategory = category;
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
    document.getElementById('selectedCategoryTitle').innerText = `目前分類：${category}`;
    
    const classSelect = document.getElementById('classSelect');
    classSelect.innerHTML = '<option value="">⏳ 讀取班級中...</option>';
    document.getElementById('studentList').innerHTML = ''; 

    try {
        let snap = await window.db.ref('rosterTemplate').once('value');
        let template = snap.val() || {};
        
        classSelect.innerHTML = '<option value="">請選擇班級...</option>';
        
        if (template[category]) {
            for (let className in template[category]) {
                classSelect.innerHTML += `<option value="${className}">${className}</option>`;
            }
        }
    } catch (error) {
        classSelect.innerHTML = '<option value="">讀取失敗</option>';
        console.error(error);
    }
}

function goBack() {
    document.getElementById('step1').style.display = 'block';
    document.getElementById('step2').style.display = 'none';
}

async function getDailyData(date) {
    let snap = await window.db.ref(`attendance_${date}`).once('value');
    if (snap.exists()) return snap.val();
    
    let tSnap = await window.db.ref('rosterTemplate').once('value');
    let template = tSnap.val() || {};
    let newData = {};
    for (let cat in template) {
        newData[cat] = {};
        for (let cls in template[cat]) {
            // 自動生成時過濾掉系統佔位符
            let validStudents = template[cat][cls].filter(s => s.id !== "_placeholder");
            newData[cat][cls] = validStudents.map(s => ({
                ...s, status: "未點名", reason: "", note: "", timeIn: "", timeOut: ""
            }));
        }
    }
    await window.db.ref(`attendance_${date}`).set(newData);
    return newData;
}

async function renderStudents() {
    const className = document.getElementById('classSelect').value;
    const date = document.getElementById('dateSelect').value;
    const listDiv = document.getElementById('studentList');
    
    if (!className) {
        listDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #7f8c8d; font-weight: bold;">👆 請先從上方選擇班級</div>';
        return;
    }

    listDiv.innerHTML = '⏳ 雲端資料載入中...';

    try {
        let dailyData = await getDailyData(date);
        listDiv.innerHTML = '';

        if (!dailyData[currentCategory] || !dailyData[currentCategory][className]) {
            listDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #7f8c8d;">本班尚無學生資料。</div>';
            return;
        }

        let students = dailyData[currentCategory][className];
        
        // 過濾掉系統佔位符
        students = students.filter(s => s.id !== "_placeholder");

        if (students.length === 0) {
            listDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #7f8c8d; font-weight: bold;">本班尚無學生資料，請先至行政後台建立。</div>';
            return;
        }

        students.forEach(student => {
            const isProcessed = student.status !== "未點名";
            const cardClass = isProcessed ? "student-card processed" : "student-card";
            const origClassTag = (currentCategory !== '周間普通班' && student.originalClass) 
                ? `<span style="font-size:12px; background:#8e44ad; color:white; padding:2px 6px; border-radius:10px; margin-left:8px;">${student.originalClass}</span>` : "";

            listDiv.innerHTML += `
                <div class="${cardClass}" id="card_${student.id}">
                    <div class="student-title">
                        <span>${student.id} 號 - ${student.name} ${origClassTag}</span>
                        <span style="font-size:14px; color:#555;">${student.status}</span>
                    </div>
                    <div class="status-btns">
                        <button onclick="setStatus('${student.id}', '出席', this)" data-val="出席" class="${student.status === '出席' ? 'active' : ''}">出席</button>
                        <button onclick="setStatus('${student.id}', '無故缺席', this)" data-val="無故缺席" class="${student.status === '無故缺席' ? 'active' : ''}">無缺</button>
                        <button onclick="setStatus('${student.id}', '部分出席', this)" data-val="部分出席" class="${student.status === '部分出席' ? 'active' : ''}">部分出席</button>
                        <button onclick="setStatus('${student.id}', '病假', this)" data-val="病假" class="yellow-alert ${student.status === '病假' ? 'active' : ''}">病假</button>
                        <button onclick="setStatus('${student.id}', '喪假', this)" data-val="喪假" class="yellow-alert ${student.status === '喪假' ? 'active' : ''}">喪假</button>
                        <button onclick="setStatus('${student.id}', '事假', this)" data-val="事假" class="yellow-alert ${student.status === '事假' ? 'active' : ''}">事假</button>
                        <button onclick="setStatus('${student.id}', '因故缺席', this)" data-val="因故缺席" class="yellow-alert ${student.status === '因故缺席' ? 'active' : ''}">因故</button>
                    </div>
                    <div class="input-group">
                        <div id="timeGroup_${student.id}" class="time-group" style="${student.status === '部分出席' ? 'display:flex;' : 'display:none;'}">
                            <label>入校 <input type="time" id="timeIn_${student.id}" value="${student.timeIn || ''}"></label>
                            <label>離校 <input type="time" id="timeOut_${student.id}" value="${student.timeOut || ''}"></label>
                        </div>
                        <input type="text" id="reason_${student.id}" class="text-input" placeholder="填寫缺席原因..." value="${student.reason || ''}" style="${student.status === '因故缺席' ? 'display:block;' : 'display:none;'}">
                        <input type="text" id="note_${student.id}" class="text-input" placeholder="新增備註 (選填)..." value="${student.note || ''}">
                    </div>
                </div>
            `;
        });
    } catch (e) {
        listDiv.innerHTML = '<div style="color:red; text-align:center; padding: 20px;">讀取資料發生錯誤！</div>';
        console.error(e);
    }
}

function setStatus(studentId, status, btnElement) {
    let siblings = btnElement.parentElement.children;
    for (let btn of siblings) btn.classList.remove('active');
    btnElement.classList.add('active');

    document.getElementById(`reason_${studentId}`).style.display = (status === '因故缺席') ? 'block' : 'none';
    document.getElementById(`timeGroup_${studentId}`).style.display = (status === '部分出席') ? 'flex' : 'none';
}

async function submitAttendance() {
    const className = document.getElementById('classSelect').value;
    const date = document.getElementById('dateSelect').value;
    if (!className) return alert('請先選擇班級！');

    try {
        let dailyData = await getDailyData(date);
        const students = dailyData[currentCategory][className];
        const changedLogs = [];

        students.forEach(student => {
            if (student.id === "_placeholder") return;
            const activeBtn = document.querySelector(`#card_${student.id} .active`);
            if (activeBtn) {
                const newStatus = activeBtn.getAttribute('data-val');
                const newReason = document.getElementById(`reason_${student.id}`).value || "";
                const newNote = document.getElementById(`note_${student.id}`).value || "";
                const newTimeIn = document.getElementById(`timeIn_${student.id}`) ? document.getElementById(`timeIn_${student.id}`).value : "";
                const newTimeOut = document.getElementById(`timeOut_${student.id}`) ? document.getElementById(`timeOut_${student.id}`).value : "";

                // 🌟 比對是否有變動，有變動才記入操作紀錄
                const isChanged =
                    student.status !== newStatus ||
                    (student.reason || "") !== newReason ||
                    (student.note || "") !== newNote ||
                    (student.timeIn || "") !== newTimeIn ||
                    (student.timeOut || "") !== newTimeOut;

                if (isChanged) {
                    const oldStatus = student.status || "未點名";
                    let detail = `將 [${date}] ${className} ${student.id}號 ${student.name} 從「${oldStatus}」改為「${newStatus}」`;
                    if (newStatus === '部分出席' && (newTimeIn || newTimeOut)) {
                        detail += ` (${newTimeIn}~${newTimeOut})`;
                    }
                    if (newReason) detail += ` (原因:${newReason})`;
                    if (newNote) detail += ` (備註:${newNote})`;
                    changedLogs.push(detail);
                }

                student.status = newStatus;
                student.reason = newReason;
                student.note = newNote;
                student.timeIn = newTimeIn;
                student.timeOut = newTimeOut;
            }
        });

        // 🌟 儲存點名資料
        await window.db.ref(`attendance_${date}`).set(dailyData);
        
        // 🌟 紀錄「最後更新時間」(儲存為時間戳記)
        await window.db.ref(`attendance_meta/${date}/${currentCategory}/${className}`).set(Date.now());

        // 🌟 逐筆寫入操作紀錄
        if (typeof logActivity === 'function' && changedLogs.length > 0) {
            await Promise.all(changedLogs.map(detail => logActivity('點名紀錄', detail)));
        }
        
        alert(`雲端同步成功！${date} ${className} 點名更新完成！`);
        renderStudents();
    } catch (error) {
        alert("同步失敗，請檢查網路連線！");
        console.error(error);
    }
}