// 防繞道守衛：未驗證前先隱藏畫面，避免偷窺內容
document.documentElement.style.visibility = 'hidden';

(function () {
    const currentScript = document.currentScript;
    const requiredRole = currentScript ? currentScript.getAttribute('data-role') : 'teacher';

    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.replace('index.html');
            return;
        }

        try {
            const snap = await window.db.ref(`users/${user.uid}`).once('value');
            const profile = snap.val();

            // 未註冊或尚未審核通過 -> 踢回大廳
            if (!profile || profile.status !== 'approved') {
                window.location.replace('index.html');
                return;
            }

            // 教師試圖直接輸入網址進行政頁面 -> 警告並踢回大廳
            if (requiredRole === 'admin' && profile.role !== 'admin') {
                alert("🚫 權限不足！此頁面僅限行政人員使用。");
                window.location.replace('index.html');
                return;
            }

            // 驗證通過，顯示畫面
            document.documentElement.style.visibility = 'visible';
        } catch (err) {
            window.location.replace('index.html');
        }
    });
})();