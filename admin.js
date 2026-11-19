document.getElementById('adminDateSelect').value = new Date().toISOString().split('T')[0];
const chart = document.getElementById('seatingChart');
let currentCategory = "";
let currentDailyData = {};
let dailyListenerRef = null;

function selectAdminCategory(category) {
    currentCategory = category;
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
    document.getElementById('adminCategoryTitle').innerText = category;
    loadAdminClasses();
}

function goBack() {
    document.getElementById('step1').style.display = 'block';
    document.getElementById('step2').style.display = 'none';
    currentCategory = "";
    if(dailyListenerRef) dailyListenerRef.off(); // 離開時關閉監聽
}

function initGrid() {
    chart.innerHTML = '';
    for (let i = 0; i < 36; i++) {
        chart.innerHTML += `<div class="seat-slot" id="slot_${i}" ondragover="allowDrop(event)" ondrop="drop(event, ${i})"></div>`;
    }
}

async function loadAdminClasses() {
    let snap = await window.db.ref('rosterTemplate').once('value');
    let template = snap.val() || {};
    
    const classSelect = document.getElementById('adminClassSelect');
    classSelect.innerHTML = '<option value="">請選擇班級...</option>';
    
    if (template[currentCategory]) {
        for (let className in template[currentCategory]) {
            classSelect.innerHTML += `<option value="${className}">${className}</option>`;
        }
    }
    initGrid(); 
}

// 🌟 核心：啟動 Firebase 即時監聽
function loadSeatingChart() {
    const className = document.getElementById('adminClassSelect').value;
    const date = document.getElementById('adminDateSelect').value;
    if (!className) return;

    if (dailyListenerRef) dailyListenerRef.off(); // 移除舊的監聽
    
    dailyListenerRef = window.db.ref(`attendance_${date}`);
    dailyListenerRef.on('value', async (snap) => {
        if (snap.exists()) {
            currentDailyData = snap.val();
        } else {
            let tSnap = await window.db.ref('rosterTemplate').once('value');
            let template = tSnap.val() || {};
            let newData = {};
            for (let cat in template) {
                newData[cat] = {};
                for (let cls in template[cat]) {
                    newData[cat][cls] = template[cat][cls].map(s => ({
                        ...s, status: "未點名", reason: "", note: "", timeIn: "", timeOut: ""
                    }));
                }
            }
            currentDailyData = newData;
            await window.db.ref(`attendance_${date}`).set(newData);
        }
        renderGrid(className);
        document.getElementById('lastUpdate').innerText = `最後更新：${new Date().toLocaleTimeString()}`;
    });
}

function renderGrid(className) {
    initGrid();
    if (!currentDailyData[currentCategory] || !currentDailyData[currentCategory][className]) return;
    
    let students = currentDailyData[currentCategory][className];
    
    // 🌟 過濾掉 Firebase 佔位符，不顯示在座位表上
    students = students.filter(s => s.id !== "_placeholder");
    
    students.forEach(student => {
        let glowClass = "no-glow";
        let processedClass = student.status !== "未點名" ? "processed" : ""; 

        if (student.status === "出席") glowClass = "glow-green";
        else if (student.status === "無故缺席") glowClass = "glow-red";
        else if (student.status === "部分出席") glowClass = "glow-purple";
        else if (["病假", "喪假", "事假", "因故缺席"].includes(student.status)) glowClass = "glow-yellow";

        let extraInfo = "";
        if (student.status === "部分出席" && student.timeIn) {
            extraInfo = `<div class="stu-note">${student.timeIn}~${student.timeOut}</div>`;
        } else if (student.note) {
            extraInfo = `<div class="stu-note">📝${student.note}</div>`;
        }

        const origClassBadge = (currentCategory !== '周間普通班' && student.originalClass) 
            ? `<div style="font-size:10px; color:white; background:#8e44ad; border-radius:3px; padding:1px 4px; margin-bottom:2px; display:inline-block;">${student.originalClass}</div>` : "";

        const badgeHTML = `
            <div class="student-badge ${glowClass} ${processedClass}" id="stu_${student.id}" draggable="true" ondragstart="drag(event, '${student.id}')" onclick="openModal('${student.id}')">
                ${origClassBadge}
                <span class="stu-name">${student.id} ${student.name}</span>
                <span class="stu-status">${student.status}</span>
                ${student.reason ? `<span class="stu-reason">(${student.reason})</span>` : ''}
                ${extraInfo}
            </div>
        `;
        
        let targetSlot = document.getElementById(`slot_${student.pos}`);
        if (targetSlot && targetSlot.innerHTML === '') {
            targetSlot.innerHTML = badgeHTML;
        } else {
            for(let i=0; i<36; i++) {
                let slot = document.getElementById(`slot_${i}`);
                if(slot.innerHTML === '') {
                    slot.innerHTML = badgeHTML;
                    student.pos = i; 
                    break;
                }
            }
        }
    });
}

// 🌟 拖曳功能（支援移至空位 ＋ 直接與同學互換座位 ＋ 紀錄活動）
let draggedId = null;

function allowDrop(ev) { 
    ev.preventDefault(); 
}

function drag(ev, id) { 
    draggedId = String(id);
    ev.dataTransfer.setData("text/plain", draggedId);
    ev.stopPropagation(); 
}

async function drop(ev, slotIndex) {
    ev.preventDefault();
    const targetSlot = ev.target.closest('.seat-slot');
    if (!targetSlot || !draggedId) return;

    const className = document.getElementById('adminClassSelect').value;
    const date = document.getElementById('adminDateSelect').value;
    const dailyList = currentDailyData[currentCategory][className];

    const draggedStu = dailyList.find(s => String(s.id) === draggedId);
    if (!draggedStu) return;

    const oldPos = draggedStu.pos;
    if (oldPos === slotIndex) return;

    const occupantStu = dailyList.find(s => s.id !== "_placeholder" && s.pos === slotIndex);

    // 1. 更新當日資料座標
    draggedStu.pos = slotIndex;
    if (occupantStu) {
        occupantStu.pos = oldPos;
    }

    // 2. 同步更新範本 (rosterTemplate) 的座標
    let tSnap = await window.db.ref('rosterTemplate').once('value');
    let template = tSnap.val();
    if (template && template[currentCategory] && template[currentCategory][className]) {
        const tList = template[currentCategory][className];
        dailyList.forEach(dStu => {
            if (dStu.id === "_placeholder") return;
            const tStu = tList.find(s => String(s.id) === String(dStu.id));
            if (tStu) tStu.pos = dStu.pos;
        });
        await window.db.ref('rosterTemplate').set(template);
    }

    // 3. 寫回當日點名資料
    await window.db.ref(`attendance_${date}`).set(currentDailyData);

    // 4. 寫入操作紀錄
    if (typeof logActivity === 'function') {
        const detail = occupantStu
            ? `將 ${className} ${draggedStu.name} 與 ${occupantStu.name} 互換座位`
            : `將 ${className} ${draggedStu.name} 的座位調整至第 ${slotIndex + 1} 格`;
        await logActivity('座位調整', detail);
    }

    draggedId = null;
}

// Modal 邏輯
let currentEditStuId = null;

function openModal(stuId) {
    const className = document.getElementById('adminClassSelect').value;
    const student = currentDailyData[currentCategory][className].find(s => String(s.id) === String(stuId));
    if(!student) return;

    currentEditStuId = stuId;
    document.getElementById('statusModal').style.display = 'flex';
    document.getElementById('modalStuName').innerText = `修改 ${student.name} 的狀態`;
    document.getElementById('modalStatusSelect').value = student.status;
    document.getElementById('modalReason').value = student.reason || '';
    document.getElementById('modalNote').value = student.note || '';
    document.getElementById('modalTimeIn').value = student.timeIn || '';
    document.getElementById('modalTimeOut').value = student.timeOut || '';

    updateModalFields(student.status);
}

document.getElementById('modalStatusSelect').addEventListener('change', function() {
    updateModalFields(this.value);
});

function updateModalFields(status) {
    document.getElementById('modalReason').style.display = status === '因故缺席' ? 'block' : 'none';
    document.getElementById('modalTimeGroup').style.display = status === '部分出席' ? 'flex' : 'none';
}

function closeModal() {
    document.getElementById('statusModal').style.display = 'none';
    currentEditStuId = null;
}

async function saveAdminStatus() {
    if (!currentEditStuId) return;
    const date = document.getElementById('adminDateSelect').value;
    const className = document.getElementById('adminClassSelect').value;
    const student = currentDailyData[currentCategory][className].find(s => String(s.id) === String(currentEditStuId));
    
    if(student) {
        const oldStatus = student.status || "未點名";
        const newStatus = document.getElementById('modalStatusSelect').value;
        const newReason = document.getElementById('modalReason').value || "";
        const newNote = document.getElementById('modalNote').value || "";
        const newTimeIn = document.getElementById('modalTimeIn').value || "";
        const newTimeOut = document.getElementById('modalTimeOut').value || "";

        student.status = newStatus;
        student.reason = newReason;
        student.note = newNote;
        student.timeIn = newTimeIn;
        student.timeOut = newTimeOut;
        
        // 🌟 儲存點名資料
        await window.db.ref(`attendance_${date}`).set(currentDailyData);
        
        // 🌟 紀錄「最後更新時間」
        await window.db.ref(`attendance_meta/${date}/${currentCategory}/${className}`).set(Date.now());

        // 🌟 寫入操作紀錄
        if (typeof logActivity === 'function') {
            let detail = `將 [${date}] ${className} ${student.id}號 ${student.name} 從「${oldStatus}」改為「${newStatus}」`;
            if (newStatus === '部分出席' && (newTimeIn || newTimeOut)) {
                detail += ` (${newTimeIn}~${newTimeOut})`;
            }
            if (newReason) detail += ` (原因:${newReason})`;
            if (newNote) detail += ` (備註:${newNote})`;
            await logActivity('點名紀錄', detail);
        }
        
        closeModal();       
    }
}

// 🌟 接收從「點名查詢系統」跳轉過來的請求，自動載入指定班級與日期
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const qDate = urlParams.get('date');
        const qCat = urlParams.get('category');
        const qClass = urlParams.get('class');

        if (qDate && qCat && qClass) {
            document.getElementById('adminDateSelect').value = qDate;
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
            document.getElementById('adminCategoryTitle').innerText = qCat;
            currentCategory = qCat;
            
            await loadAdminClasses();
            
            document.getElementById('adminClassSelect').value = qClass;
            loadSeatingChart();
        }
    }, 500); 
});