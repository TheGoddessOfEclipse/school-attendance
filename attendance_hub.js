const HUB_MODULES = [
    {
        key: 'leave_register',
        name: '請假登記',
        sub: '事前登記',
        icon: '📝',
        desc: '幫學生事前登記請假，即時同步至各節次點名表與操作紀錄',
        href: 'leave_register.html'
    },
    {
        key: 'student_query',
        name: '差勤查詢',
        sub: '個人報表',
        icon: '🔍',
        desc: '依學生與指定日期區間查詢所有點名紀錄，支援一鍵友善列印 PDF',
        href: 'student_attendance_query.html'
    }
];

const STEP_ANGLE = (Math.PI * 2) / HUB_MODULES.length;
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.22;

let orbitAngle = 0;
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

function initHubOrbit() {
    const container = document.getElementById('orbitSatellites');
    const stage = document.getElementById('orbitStage');
    if (!container || !stage) return;

    container.innerHTML = '';
    satelliteEls = HUB_MODULES.map((mod, idx) => {
        const el = document.createElement('div');
        el.className = 'sat-diamond';
        el.dataset.index = idx;
        el.innerHTML = `
            <div class="sat-inner">
                <span class="sat-icon">${mod.icon}</span>
                <span class="sat-name">${mod.name}</span>
                <span class="sat-sub">${mod.sub}</span>
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
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') stepOrbit(-1);
        else if (e.key === 'ArrowRight') stepOrbit(1);
        else if (e.key === 'Enter') enterActiveModule();
    });
    requestAnimationFrame(animateOrbit);
}

function getOrbitRadii() {
    const stage = document.getElementById('orbitStage');
    const w = stage ? stage.clientWidth || 760 : 760;
    const h = stage ? stage.clientHeight || 440 : 440;
    const satSize = (satelliteEls[0] && satelliteEls[0].offsetWidth) ? satelliteEls[0].offsetWidth : 120;
    const rx = Math.max(110, (w / 2) - (satSize * 0.8 + 16));
    const maxRy = Math.max(90, (h / 2) - (satSize * 0.85 + 16));
    return { rx, ry: Math.min(maxRy, 155) };
}

function bindOrbitGestures(stage) {
    function getPointerAngle(clientX, clientY) {
        const rect = stage.getBoundingClientRect();
        const dx = clientX - (rect.left + rect.width / 2);
        const dy = clientY - (rect.top + rect.height / 2);
        return { angle: Math.atan2(dy, dx), dist: Math.hypot(dx, dy) };
    }

    stage.addEventListener('pointerdown', (e) => {
        if (e.target.closest('#centerDiamond')) return;
        isDragging = true; hasDragged = false; targetAngle = null; angularVelocity = 0;
        dragStartX = e.clientX; dragStartY = e.clientY; lastPointerX = e.clientX;
        lastPointerAngle = getPointerAngle(e.clientX, e.clientY).angle;
        stage.classList.add('dragging');
        if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
    });

    stage.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 7) hasDragged = true;
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
        if (Math.abs(angularVelocity) < 0.008) snapToNearest();
        setTimeout(() => { hasDragged = false; }, 50);
    };

    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        stepOrbit(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
}

function snapToNearest() { targetAngle = Math.round(orbitAngle / STEP_ANGLE) * STEP_ANGLE; }
function stepOrbit(dir) {
    const base = (targetAngle !== null) ? targetAngle : Math.round(orbitAngle / STEP_ANGLE) * STEP_ANGLE;
    targetAngle = base - dir * STEP_ANGLE;
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
    const mod = HUB_MODULES[activeIndex];
    if (mod && mod.href) window.location.href = mod.href;
}

function animateOrbit() {
    if (!isDragging) {
        if (targetAngle !== null) {
            const diff = targetAngle - orbitAngle;
            if (Math.abs(diff) < 0.0012) { orbitAngle = targetAngle; targetAngle = null; }
            else orbitAngle += diff * 0.14;
        } else if (Math.abs(angularVelocity) > 0.0005) {
            orbitAngle += angularVelocity;
            angularVelocity *= 0.92;
            if (Math.abs(angularVelocity) < 0.004) { angularVelocity = 0; snapToNearest(); }
        }
    }
    renderOrbitPositions();
    requestAnimationFrame(animateOrbit);
}

function renderOrbitPositions() {
    if (satelliteEls.length === 0) return;
    const { rx, ry } = getOrbitRadii();
    let bestIdx = 0, maxSin = -2;

    HUB_MODULES.forEach((mod, idx) => {
        const theta = orbitAngle + idx * STEP_ANGLE + Math.PI / 2;
        const cosT = Math.cos(theta), sinT = Math.sin(theta);
        if (sinT > maxSin) { maxSin = sinT; bestIdx = idx; }
        const depth = (sinT + 1) / 2;
        const el = satelliteEls[idx];
        el.style.transform = `translate(-50%, -50%) translate3d(${(cosT * rx).toFixed(1)}px, ${(sinT * ry).toFixed(1)}px, 0) scale(${(MIN_SCALE + depth * (MAX_SCALE - MIN_SCALE)).toFixed(3)}) rotate(45deg)`;
        el.style.opacity = (0.46 + depth * 0.54).toFixed(3);
        el.style.zIndex = Math.round(5 + depth * 32);
    });

    if (bestIdx !== activeIndex || !satelliteEls[bestIdx].classList.contains('is-active')) {
        activeIndex = bestIdx;
        satelliteEls.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
        const mod = HUB_MODULES[activeIndex];
        document.getElementById('activeModuleName').innerText = mod.name;
        document.getElementById('centerCurrentLabel').innerText = mod.name;
        document.getElementById('activeModuleDesc').innerText = mod.desc;
    }
}

initHubOrbit();