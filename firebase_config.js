const firebaseConfig = {
  apiKey: "AIzaSyBGaK6vRbz8eCDL64p_qh-XcaKq8hV9GNY",
  authDomain: "school-attendance-e156f.firebaseapp.com",
  // 👇 這是手動補上的資料庫網址
  databaseURL: "https://school-attendance-e156f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "school-attendance-e156f",
  storageBucket: "school-attendance-e156f.firebasestorage.app",
  messagingSenderId: "1035882451694",
  appId: "1:1035882451694:web:d57d2e167b460ec1b7d9ff"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
window.db = firebase.database();
console.log("🔥 Firebase 雲端資料庫連線成功！");