// logger.js - 全站共用操作活動紀錄模組
window._cachedLoggerProfile = null;

async function logActivity(action, details) {
    try {
        const user = firebase.auth().currentUser;
        if (!user) return;

        // 讀取並快取目前登入者姓名與身分，避免重複查詢資料庫
        if (!window._cachedLoggerProfile || window._cachedLoggerProfile.uid !== user.uid) {
            const snap = await window.db.ref(`users/${user.uid}`).once('value');
            window._cachedLoggerProfile = snap.val() || {
                uid: user.uid,
                name: user.displayName || user.email,
                role: 'unknown'
            };
        }

        const profile = window._cachedLoggerProfile;
        await window.db.ref('activityLogs').push({
            timestamp: Date.now(),
            uid: user.uid,
            userName: profile.name || user.email,
            userRole: profile.role || 'teacher',
            action: action,
            details: details
        });
    } catch (err) {
        console.error("寫入操作紀錄失敗：", err);
    }
}