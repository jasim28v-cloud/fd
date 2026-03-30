import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getDatabase, ref, push, set, onValue, update, get, child } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDr5RBcJ9gcHTdElXxazcEWMBoTYzC_CaU",
    authDomain: "foxe-3f428.firebaseapp.com",
    databaseURL: "https://foxe-3f428-default-rtdb.firebaseio.com",
    projectId: "foxe-3f428",
    storageBucket: "foxe-3f428.firebasestorage.app",
    messagingSenderId: "763563407239",
    appId: "1:763563407239:web:4e558a73bffb5e6e1e8522"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export { ref, push, set, onValue, update, get, child };

// Cloudinary
export const CLOUD_NAME = 'dnmpmysk6';
export const UPLOAD_PRESET = 'rsxdfdgw';

console.log('✅ InstaPics Ready');
