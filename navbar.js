// navbar.js - 全站共用頂部導覽列（深墨綠細金毛玻璃版）
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
            background: rgba(14, 22, 19, 0.82);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: #f4f6f5;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 22px;
            box-sizing: border-box;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.28);
            border-bottom: 1px solid rgba(212, 180, 117, 0.35);
            z-index: 9999;
            font-family: 'Noto Sans TC', 'Segoe UI', 'Microsoft JhengHei', sans-serif;
        }
        .nav-brand {
            display: flex;
            align-items: center;
            gap: 11px;
            text-decoration: none;
            color: #f4f6f5;
            transition: opacity 0.2s;
        }
        .nav-brand:hover {
            opacity: 0.88;
        }
        .nav-logo-svg {
            width: 36px;
            height: 36px;
            flex-shrink: 0;
            filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35));
        }
        .nav-title-group {
            display: flex;
            flex-direction: column;
            line-height: 1.2;
        }
        .nav-school-name {
            font-family: 'Noto Serif TC', 'Microsoft JhengHei', serif;
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 2px;
            color: #ffffff;
        }
        .nav-system-sub {
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 2.5px;
            color: #d4b475;
            margin-top: 2px;
        }
        .nav-user-area {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
        }
        .nav-user-name {
            font-weight: 600;
            color: #e6ece9;
            letter-spacing: 0.5px;
        }
        .nav-role-badge {
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.5px;
        }
        .nav-role-admin {
            background: rgba(155, 89, 182, 0.26);
            border: 1px solid rgba(187, 143, 206, 0.55);
            color: #eedcf7;
        }
        .nav-role-teacher {
            background: rgba(39, 174, 96, 0.26);
            border: 1px solid rgba(82, 190, 128, 0.55);
            color: #d4f3e0;
        }
        .nav-role-pending {
            background: rgba(212, 180, 117, 0.22);
            border: 1px solid rgba(212, 180, 117, 0.6);
            color: #f5e2ba;
        }
        .nav-btn-logout {
            background: transparent;
            color: #d4b475;
            border: 1px solid rgba(212, 180, 117, 0.45);
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.5px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .nav-btn-logout:hover {
            background: #d4b475;
            color: #0e1613;
            border-color: #d4b475;
        }
        @media (max-width: 550px) {
            #global-navbar { padding: 0 12px; }
            .nav-school-name { font-size: 14px; letter-spacing: 1px; }
            .nav-system-sub { font-size: 10px; letter-spacing: 1.5px; }
            .nav-user-name { display: none; }
        }
    `;
    document.head.appendChild(style);

    // 2. 建立導覽列 HTML（深墨綠＋細金幾何石榴 SVG Logo）
    const nav = document.createElement('header');
    nav.id = 'global-navbar';
    nav.innerHTML = `
        <a href="index.html" class="nav-brand" title="返回系統大廳">
            <svg class="nav-logo-svg" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="goldFrameGrad" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#f0d79e"/>
                        <stop offset="100%" stop-color="#a98643"/>
                    </linearGradient>
                    <linearGradient id="pomegranateRubyGrad" x1="12" y1="12" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#d9534f"/>
                        <stop offset="100%" stop-color="#8b2626"/>
                    </linearGradient>
                </defs>
                <!-- 外框細金六角形 -->
                <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#0e1613" stroke="url(#goldFrameGrad)" stroke-width="2"/>
                <!-- 石榴皇冠蒂頭（金色） -->
                <path d="M16 11.5L18 8.5L20 10.5L22 8.5L24 11.5" stroke="#d4b475" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- 石榴果實本體（深紅寶石漸層＋細金描邊） -->
                <circle cx="20" cy="21.5" r="8.2" fill="url(#pomegranateRubyGrad)" stroke="rgba(212,180,117,0.55)" stroke-width="0.9"/>
                <!-- 內部科技節點（淡金連線） -->
                <circle cx="17.5" cy="20" r="1.4" fill="#f5e2ba"/>
                <circle cx="22.5" cy="20" r="1.4" fill="#f5e2ba"/>
                <circle cx="20" cy="24.5" r="1.4" fill="#f5e2ba"/>
                <path d="M17.5 20L22.5 20L20 24.5Z" stroke="#f5e2ba" stroke-width="0.9" stroke-opacity="0.8"/>
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