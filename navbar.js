// navbar.js - 全站共用頂部導覽列（Logo + 登入者資訊）
(function () {
    // 1. 注入共用 CSS 樣式
    const style = document.createElement('style');
    style.innerHTML = `
        body {
            padding-top: 76px !important;
        }
        #global-navbar {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 60px;
            background: linear-gradient(90deg, #1a252f 0%, #2c3e50 100%);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            box-sizing: border-box;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            border-bottom: 2px solid #e74c3c;
            z-index: 9999;
            font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif;
        }
        .nav-brand {
            display: flex;
            align-items: center;
            gap: 11px;
            text-decoration: none;
            color: #ffffff;
            transition: opacity 0.2s;
        }
        .nav-brand:hover {
            opacity: 0.88;
        }
        .nav-logo-svg {
            width: 36px;
            height: 36px;
            flex-shrink: 0;
        }
        .nav-title-group {
            display: flex;
            flex-direction: column;
            line-height: 1.2;
        }
        .nav-school-name {
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 1.5px;
            color: #ffffff;
        }
        .nav-system-sub {
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 2px;
            color: #74b9ff;
            margin-top: 2px;
        }
        .nav-user-area {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
        }
        .nav-user-name {
            font-weight: 700;
            color: #ecf0f1;
        }
        .nav-role-badge {
            padding: 3px 9px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
            letter-spacing: 0.5px;
        }
        .nav-role-admin {
            background: #9b59b6;
            color: #fff;
        }
        .nav-role-teacher {
            background: #27ae60;
            color: #fff;
        }
        .nav-role-pending {
            background: #f39c12;
            color: #fff;
        }
        .nav-btn-logout {
            background: rgba(255, 255, 255, 0.12);
            color: #ecf0f1;
            border: 1px solid rgba(255, 255, 255, 0.25);
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .nav-btn-logout:hover {
            background: #e74c3c;
            border-color: #e74c3c;
        }
        @media (max-width: 550px) {
            #global-navbar { padding: 0 12px; }
            .nav-school-name { font-size: 14px; letter-spacing: 0.5px; }
            .nav-system-sub { font-size: 10px; letter-spacing: 1px; }
            .nav-user-name { display: none; } /* 手機版空間有限時優先顯示身分與登出 */
        }
    `;
    document.head.appendChild(style);

    // 2. 建立導覽列 HTML（含幾何科技石榴 SVG Logo）
    const nav = document.createElement('header');
    nav.id = 'global-navbar';
    nav.innerHTML = `
        <a href="index.html" class="nav-brand" title="返回系統大廳">
            <svg class="nav-logo-svg" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="pomegranateGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#ff6b6b"/>
                        <stop offset="100%" stop-color="#c0392b"/>
                    </linearGradient>
                </defs>
                <!-- 外框科技六角形 -->
                <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#1e272e" stroke="url(#pomegranateGrad)" stroke-width="2.2"/>
                <!-- 石榴皇冠蒂頭 -->
                <path d="M16 11L18 8L20 10L22 8L24 11" stroke="#ff7675" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- 石榴本體 -->
                <circle cx="20" cy="21" r="8.5" fill="url(#pomegranateGrad)"/>
                <!-- 內部科技節點（象徵籽與數位連線） -->
                <circle cx="17.5" cy="19.5" r="1.5" fill="#ffffff"/>
                <circle cx="22.5" cy="19.5" r="1.5" fill="#ffffff"/>
                <circle cx="20" cy="24" r="1.5" fill="#ffffff"/>
                <path d="M17.5 19.5L22.5 19.5L20 24Z" stroke="#ffffff" stroke-width="1" stroke-opacity="0.8"/>
            </svg>
            <div class="nav-title-group">
                <span class="nav-school-name">石榴科技實驗學校</span>
                <span class="nav-system-sub">線上點名系統</span>
            </div>
        </a>

        <div class="nav-user-area" id="navUserArea" style="display: none;">
            <span class="nav-role-badge" id="navRoleBadge"></span>
            <span class="nav-user-name" id="navUserName"></span>
            <button class="nav-btn-logout" onclick="globalNavLogout()">登出</button>
        </div>
    `;

    // 插入到 body 最上方
    if (document.body) {
        document.body.prepend(nav);
    } else {
        window.addEventListener('DOMContentLoaded', () => document.body.prepend(nav));
    }

    // 3. 監聽 Firebase 登入狀態，自動填入姓名與身分
    function bindAuthToNavbar() {
        if (typeof firebase === 'undefined' || !firebase.auth) return;

        firebase.auth().onAuthStateChanged(async (user) => {
            const userArea = document.getElementById('navUserArea');
            if (!userArea) return;

            if (!user) {
                userArea.style.display = 'none';
                return;
            }

            const nameEl = document.getElementById('navUserName');
            const badgeEl = document.getElementById('navRoleBadge');

            try {
                const snap = await window.db.ref(`users/${user.uid}`).once('value');
                const profile = snap.val();

                if (profile) {
                    nameEl.innerText = profile.name || user.email;
                    if (profile.status !== 'approved') {
                        badgeEl.innerText = '待審核';
                        badgeEl.className = 'nav-role-badge nav-role-pending';
                    } else if (profile.role === 'admin') {
                        badgeEl.innerText = '行政管理員';
                        badgeEl.className = 'nav-role-badge nav-role-admin';
                    } else {
                        badgeEl.innerText = '教師';
                        badgeEl.className = 'nav-role-badge nav-role-teacher';
                    }
                } else {
                    nameEl.innerText = user.email;
                    badgeEl.innerText = '未註冊';
                    badgeEl.className = 'nav-role-badge nav-role-pending';
                }
                userArea.style.display = 'flex';
            } catch (err) {
                console.error("導覽列讀取使用者資訊失敗：", err);
            }
        });
    }

    window.globalNavLogout = function () {
        if (confirm("確定要登出系統嗎？")) {
            firebase.auth().signOut().then(() => {
                window.location.replace('index.html');
            });
        }
    };

    bindAuthToNavbar();
})();