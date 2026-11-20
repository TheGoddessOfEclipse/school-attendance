// ==================== 1. 行政後端 5 大業務模組設定 ====================
const ADMIN_MODULES = [
    {
        key: 'attendance',
        name: '出席狀況檢視',
        sub: '巡堂監控',
        icon: '📋',
        desc: '巡堂座位表、檢視與修改每日點名狀況',
        href: 'admin.html'
    },
    {
        key: 'classes',
        name: '班級資料管理',
        sub: '班種建置',
        icon: '🏫',
        desc: '建立與刪除班種、班級、社團、校隊與各科分組名單',
        href: 'manage_classes.html'
    },
    {
        key: 'students',
        name: '學生資料管理',
        sub: '全校總檔',
        icon: '🧑‍🎓',
        desc: '全校學生總檔、學號管理、跨分類多選與學年升級',
        href: 'manage_students.html'
    },
    {
        key: 'query',
        name: '點名資料查詢',
        sub: '到席統計',
        icon: '📊',
        desc: '檢視各班點名狀況、到席率與未到清單',
        href: 'query_attendance.html'
    },
    {
        key: 'users',
        name: '使用者資料管理',
        sub: '權限稽核',
        icon: '👥',
        desc: '審核帳號權限、切換身分角色與檢視全站操作紀錄',
        href: 'manage_users.html'
    }
];

const STEP_ANGLE = (Math.PI * 2) / ADMIN_MODULES.length;
const MIN_SCALE = 0.68;
const MAX_SCALE = 1.24;

let orbitAngle = 0;       // 0 表示第 0 顆（出席狀況檢視）鎖定在正前方 6 點鐘方向
let targetAngle = null;
let angularVelocity = 0;
let isDragging = false;
let hasDragged = false;
let dragStartX = 0;
let dragStartY = 0;
let lastPointerAngle = 0;
let lastPointerX = 0;
let activeIndex = 0;
let satelliteEls = [];

// ==================== 2. 懸浮立體星環物理引擎 ====================
function initAdminOrbit() {
    const container = document.getElementById('orbitSatellites');
    const stage = document.getElementById('orbitStage');
    if (!container || !stage) return;

    container.innerHTML = '';
    satelliteEls = ADMIN_MODULES.map((mod, idx) => {
        const el = document.createElement('div');
        el.className = 'sat-diamond';
        el.dataset.index = idx;
        el.dataset.key = mod.key;
        el.innerHTML = `
            <div class="sat-inner">
                <span class="sat-icon">${mod.icon}</span>
                <span class="sat-name">${mod.name}</span>
                <span class="sat-sub">${mod.sub}</span>
                ${mod.key === 'users' ? '<span class="pending-badge" id="pendingUsersBadge" style="display:none;"></span>' : ''}
            </div>
        `;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hasDragged) return;
            if (idx === activeIndex) {
                window.location.href = mod.href;
            } else {
                rotateToIndex(idx);
            }
        });
        container.appendChild(el);
        return el;
    });

    bindOrbitGestures(stage);
    bindKeyboardNav();
    requestAnimationFrame(animateOrbit);
    checkPendingUsersBadge();
}

function getOrbitRadii() {
    const stage = document.getElementById('orbitStage');
    const w = stage ? stage.clientWidth || 920 : 920;
    const h = stage ? stage.clientHeight || 480 : 480;
    const satSize = (satelliteEls[0] && satelliteEls[0].offsetWidth) ? satelliteEls[0].offsetWidth : 114;

    const padX = satSize * 0.78 + 14;
    const padY = satSize * 0.92 + 16;

    const rx = Math.max(105, (w / 2) - padX);
    const maxRy = Math.max(76, (h / 2) - padY);
    const ry = Math.min(maxRy, rx * 0.58);

    return { rx, ry };
}

function bindOrbitGestures(stage) {
    function getPointerAngle(clientX, clientY) {
        const rect = stage.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        return { angle: Math.atan2(dy, dx), dist: Math.hypot(dx, dy) };
    }

    stage.addEventListener('pointerdown', (e) => {
        if (e.target.closest('#centerDiamond')) return;
        isDragging = true;
        hasDragged = false;
        targetAngle = null;
        angularVelocity = 0;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        lastPointerX = e.clientX;
        lastPointerAngle = getPointerAngle(e.clientX, e.clientY).angle;
        stage.classList.add('dragging');
        if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
    });

    stage.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const moveDist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
        if (moveDist > 7) hasDragged = true;

        const { angle, dist } = getPointerAngle(e.clientX, e.clientY);
        let delta = 0;

        if (dist > 32) {
            delta = angle - lastPointerAngle;
            if (delta > Math.PI) delta -= Math.PI * 2;
            if (delta < -Math.PI) delta += Math.PI * 2;
        } else {
            delta = -(e.clientX - lastPointerX) * 0.008;
        }

        orbitAngle += delta;
        angularVelocity = angularVelocity * 0.45 + delta * 0.55;
        lastPointerAngle = angle;
        lastPointerX = e.clientX;
    });

    const endDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        stage.classList.remove('dragging');
        if (stage.releasePointerCapture && e.pointerId !== undefined) {
            try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        if (Math.abs(angularVelocity) < 0.008) {
            snapToNearest();
        }
        setTimeout(() => { hasDragged = false; }, 50);
    };

    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        stepOrbit(dir);
    }, { passive: false });
}

function bindKeyboardNav() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            stepOrbit(-1);
        } else if (e.key === 'ArrowRight') {
            stepOrbit(1);
        } else if (e.key === 'Enter') {
            enterActiveModule();
        }
    });
}

function snapToNearest() {
    targetAngle = Math.round(orbitAngle / STEP_ANGLE) * STEP_ANGLE;
}

function stepOrbit(direction) {
    const base = (targetAngle !== null) ? targetAngle : Math.round(orbitAngle / STEP_ANGLE) * STEP_ANGLE;
    targetAngle = base - direction * STEP_ANGLE;
    angularVelocity = 0;
}

function rotateToIndex(idx) {
    const desiredMod = -idx * STEP_ANGLE;
    let diff = (desiredMod - orbitAngle) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    targetAngle = orbitAngle + diff;
    angularVelocity = 0;
}

function enterActiveModule() {
    if (hasDragged) return;
    const activeMod = ADMIN_MODULES[activeIndex];
    if (activeMod && activeMod.href) {
        window.location.href = activeMod.href;
    }
}

function animateOrbit() {
    if (!isDragging) {
        if (targetAngle !== null) {
            const diff = targetAngle - orbitAngle;
            if (Math.abs(diff) < 0.0012) {
                orbitAngle = targetAngle;
                targetAngle = null;
            } else {
                orbitAngle += diff * 0.14;
            }
        } else if (Math.abs(angularVelocity) > 0.0005) {
            orbitAngle += angularVelocity;
            angularVelocity *= 0.92;
            if (Math.abs(angularVelocity) < 0.004) {
                angularVelocity = 0;
                snapToNearest();
            }
        }
    }

    renderOrbitPositions();
    requestAnimationFrame(animateOrbit);
}

function renderOrbitPositions() {
    if (satelliteEls.length === 0) return;
    const { rx, ry } = getOrbitRadii();

    let bestIdx = 0;
    let maxSin = -2;

    ADMIN_MODULES.forEach((mod, idx) => {
        const theta = orbitAngle + idx * STEP_ANGLE + Math.PI / 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        if (sinT > maxSin) {
            maxSin = sinT;
            bestIdx = idx;
        }

        const x = cosT * rx;
        const y = sinT * ry;
        const depth = (sinT + 1) / 2; // 0 = 後方，1 = 正前方 6 點鐘

        const scale = MIN_SCALE + depth * (MAX_SCALE - MIN_SCALE);
        const opacity = 0.44 + depth * 0.56;
        const zIndex = Math.round(5 + depth * 32);

        const el = satelliteEls[idx];
        el.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(3)}) rotate(45deg)`;
        el.style.opacity = opacity.toFixed(3);
        el.style.zIndex = zIndex;
    });

    if (bestIdx !== activeIndex || !satelliteEls[bestIdx].classList.contains('is-active')) {
        activeIndex = bestIdx;
        satelliteEls.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
        const activeMod = ADMIN_MODULES[activeIndex];
        document.getElementById('activeModuleName').innerText = activeMod.name;
        document.getElementById('centerCurrentLabel').innerText = activeMod.name;
        document.getElementById('activeModuleDesc').innerText = activeMod.desc;
    }
}

// ==================== 3. 待審核帳號即時提醒 ====================
function checkPendingUsersBadge() {
    if (typeof firebase === 'undefined' || !firebase.auth) return;
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) return;
        try {
            const snap = await window.db.ref('users').once('value');
            const usersObj = snap.val() || {};
            const pendingCount = Object.values(usersObj).filter(u => u && u.status === 'pending').length;
            const badge = document.getElementById('pendingUsersBadge');
            if (badge && pendingCount > 0) {
                badge.innerText = `${pendingCount} 待審`;
                badge.style.display = 'inline-block';
            }
        } catch (err) {
            console.error("讀取待審核數失敗：", err);
        }
    });
}

initAdminOrbit();