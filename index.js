let currentUser = null;

function showView(viewId) {
    ['viewLoading', 'viewLogin', 'viewRegister', 'viewPending', 'viewLobby'].forEach(id => {
        document.getElementById(id).style.display = (id === viewId) ? 'block' : 'none';
    });

    const card = document.querySelector('.portal-card');
    if (card) {
        card.classList.toggle('lobby-mode', viewId === 'viewLobby');
    }
}

// 監聽登入狀態
firebase.auth().onAuthStateChanged(async (user) => {
    currentUser = user;
    if (!user) {
        showView('viewLogin');
        return;
    }

    const snap = await window.db.ref(`users/${user.uid}`).once('value');
    const profile = snap.val();

    if (!profile) {
        // 尚未註冊
        document.getElementById('regEmail').value = user.email;
        document.getElementById('regName').value = user.displayName || '';
        showView('viewRegister');
        return;
    }

    if (profile.status === 'pending') {
        showView('viewPending');
    } else if (profile.status === 'approved') {
        // 設定行政按鈕權限
        const btnAdmin = document.getElementById('btnAdminEntry');
        const lockBadge = document.getElementById('adminLockBadge');
        const adminIcon = document.getElementById('adminIcon');

        if (profile.role === 'admin') {
            btnAdmin.classList.remove('locked');
            btnAdmin.setAttribute('href', 'admin_index.html');
            lockBadge.style.display = 'none';
            adminIcon.innerText = '🛡️';
        } else {
            btnAdmin.classList.add('locked');
            btnAdmin.removeAttribute('href');
            lockBadge.style.display = 'inline-block';
            adminIcon.innerText = '🔒';
        }
        showView('viewLobby');
    } else {
        alert("您的帳號申請未通過或已被停權，請聯繫行政人員。");
        logout();
    }
});

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch(err => {
        alert("登入失敗：" + err.message);
    });
}

async function submitRegistration() {
    const name = document.getElementById('regName').value.trim();
    const role = document.getElementById('regRole').value;
    if (!name) return alert("請填寫您的真實姓名！");

    await window.db.ref(`users/${currentUser.uid}`).set({
        uid: currentUser.uid,
        email: currentUser.email,
        name: name,
        role: role,
        status: 'pending',
        createdAt: Date.now()
    });
    showView('viewPending');
}

function logout() {
    firebase.auth().signOut();
}