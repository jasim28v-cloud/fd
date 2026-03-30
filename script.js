import { auth, db, ref, push, set, onValue, update, get, child, CLOUD_NAME, UPLOAD_PRESET } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ========== المتغيرات العامة ==========
let currentUser = null;
let currentUserData = null;
let allUsers = {};
let allPosts = [];
let selectedImageFile = null;

// ========== تبديل بين النماذج ==========
window.switchToRegister = function() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
};
window.switchToLogin = function() {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
};

// ========== تسجيل الدخول ==========
window.login = async function() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const msg = document.getElementById('loginMsg');
    if (!email || !password) { msg.innerText = 'الرجاء ملء جميع الحقول'; return; }
    msg.innerText = 'جاري تسجيل الدخول...';
    try {
        await signInWithEmailAndPassword(auth, email, password);
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/user-not-found') msg.innerText = 'لا يوجد حساب بهذا البريد';
        else if (error.code === 'auth/wrong-password') msg.innerText = 'كلمة المرور غير صحيحة';
        else msg.innerText = 'حدث خطأ: ' + error.message;
    }
};

// ========== إنشاء حساب ==========
window.register = async function() {
    const username = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    const confirmPass = document.getElementById('regConfirmPass').value;
    const msg = document.getElementById('regMsg');
    if (!username || !email || !password || !confirmPass) { msg.innerText = 'املأ جميع الحقول'; return; }
    if (password !== confirmPass) { msg.innerText = 'كلمة المرور غير متطابقة'; return; }
    if (password.length < 6) { msg.innerText = 'كلمة المرور 6 أحرف على الأقل'; return; }
    msg.innerText = 'جاري إنشاء الحساب...';
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await set(ref(db, `users/${userCredential.user.uid}`), {
            username, email, bio: '', avatarUrl: '', followers: {}, following: {}, totalLikes: 0, createdAt: Date.now()
        });
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') msg.innerText = 'البريد الإلكتروني مستخدم بالفعل';
        else msg.innerText = 'حدث خطأ: ' + error.message;
    }
};

window.logout = function() { signOut(auth); location.reload(); };

// ========== تحميل البيانات ==========
async function loadUserData() {
    const snap = await get(child(ref(db), `users/${currentUser.uid}`));
    if (snap.exists()) currentUserData = { uid: currentUser.uid, ...snap.val() };
}
onValue(ref(db, 'users'), (s) => { allUsers = s.val() || {}; });

// ========== عرض المنشورات ==========
onValue(ref(db, 'posts'), (s) => {
    const data = s.val();
    if (!data) { allPosts = []; renderFeed(); return; }
    allPosts = [];
    Object.keys(data).forEach(key => allPosts.push({ id: key, ...data[key] }));
    allPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderFeed();
});

function renderFeed() {
    const container = document.getElementById('feedContainer');
    if (!container) return;
    container.innerHTML = '';
    if (allPosts.length === 0) {
        container.innerHTML = '<div class="loading">✨ لا توجد صور بعد</div>';
        return;
    }
    allPosts.forEach(post => {
        const user = allUsers[post.sender] || { username: post.senderName || 'user', avatarUrl: '' };
        const div = document.createElement('div');
        div.className = 'post-item';
        div.innerHTML = `
            <img src="${post.imageUrl}" alt="post">
            <div class="post-overlay">
                <span><i class="fas fa-heart"></i> ${post.likes || 0}</span>
                <span><i class="fas fa-comment"></i> ${Object.keys(post.comments || {}).length}</span>
            </div>
        `;
        div.onclick = () => openModal(post);
        container.appendChild(div);
    });
}

// ========== فتح الصورة في المودال ==========
let currentPost = null;
window.openModal = function(post) {
    currentPost = post;
    const user = allUsers[post.sender] || { username: post.senderName || 'user', avatarUrl: '' };
    const isLiked = post.likedBy && post.likedBy[currentUser?.uid];
    document.getElementById('modalImage').src = post.imageUrl;
    document.getElementById('modalUsername').innerText = user.username;
    document.getElementById('modalAvatar').innerHTML = user.avatarUrl ? `<img src="${user.avatarUrl}" class="w-full h-full rounded-full object-cover">` : (user.username?.charAt(0) || '👤');
    document.getElementById('modalTime').innerText = new Date(post.timestamp).toLocaleString();
    document.getElementById('modalCaption').innerText = post.caption || '';
    document.getElementById('modalLikes').innerText = post.likes || 0;
    document.getElementById('modalComments').innerText = Object.keys(post.comments || {}).length;
    const likeBtn = document.getElementById('modalLikeBtn');
    likeBtn.innerHTML = `<i class="fas ${isLiked ? 'fa-heart' : 'fa-heart'}"></i> <span>${post.likes || 0}</span>`;
    likeBtn.className = `flex items-center gap-1 ${isLiked ? 'text-pink-500' : ''}`;
    likeBtn.onclick = () => toggleLikeModal(post.id);
    document.getElementById('imageModal').classList.add('active');
};
window.closeModal = function() {
    document.getElementById('imageModal').classList.remove('active');
    currentPost = null;
};
window.toggleLikeModal = async function(postId) {
    if (!currentUser) return;
    const postRef = ref(db, `posts/${postId}`);
    const snap = await get(postRef);
    const post = snap.val();
    let likes = post.likes || 0;
    let likedBy = post.likedBy || {};
    if (likedBy[currentUser.uid]) {
        likes--; delete likedBy[currentUser.uid];
    } else {
        likes++; likedBy[currentUser.uid] = true;
    }
    await update(postRef, { likes, likedBy });
    if (currentPost && currentPost.id === postId) {
        currentPost.likes = likes;
        currentPost.likedBy = likedBy;
        document.getElementById('modalLikes').innerText = likes;
        const isLiked = likedBy[currentUser.uid];
        const likeBtn = document.getElementById('modalLikeBtn');
        likeBtn.innerHTML = `<i class="fas ${isLiked ? 'fa-heart' : 'fa-heart'}"></i> <span>${likes}</span>`;
        likeBtn.className = `flex items-center gap-1 ${isLiked ? 'text-pink-500' : ''}`;
    }
    renderFeed();
};

// ========== رفع صورة ==========
window.openUploadPanel = function() { document.getElementById('uploadPanel').classList.add('open'); };
window.closeUploadPanel = function() { document.getElementById('uploadPanel').classList.remove('open'); resetUploadForm(); };
function resetUploadForm() {
    selectedImageFile = null;
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('postCaption').value = '';
    document.getElementById('postImageInput').value = '';
    document.getElementById('uploadStatus').innerHTML = '';
}
window.previewImage = function(input) {
    const file = input.files[0];
    if (!file) return;
    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('previewImg').src = e.target.result;
        document.getElementById('imagePreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
};
window.uploadPost = async function() {
    if (!selectedImageFile) { alert('اختر صورة أولاً'); return; }
    const caption = document.getElementById('postCaption').value;
    const statusDiv = document.getElementById('uploadStatus');
    statusDiv.innerHTML = '📤 جاري الرفع...';
    const fd = new FormData();
    fd.append('file', selectedImageFile);
    fd.append('upload_preset', UPLOAD_PRESET);
    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
        const data = await res.json();
        await push(ref(db, 'posts'), {
            imageUrl: data.secure_url,
            caption: caption,
            sender: currentUser.uid,
            senderName: currentUserData?.username,
            likes: 0,
            likedBy: {},
            comments: {},
            timestamp: Date.now()
        });
        statusDiv.innerHTML = '✅ تم النشر!';
        setTimeout(() => { closeUploadPanel(); renderFeed(); }, 1500);
    } catch (error) {
        statusDiv.innerHTML = '❌ فشل الرفع: ' + error.message;
    }
};

// ========== البحث والإشعارات (مبدئية) ==========
window.openSearch = function() { alert('ميزة البحث قيد التطوير'); };
window.openNotifications = function() { alert('ميزة الإشعارات قيد التطوير'); };
window.openMyProfile = async function() {
    if (!currentUser) return;
    alert('سيتم عرض الملف الشخصي قريباً');
};

// ========== التنقل ==========
window.switchTab = function(tab) {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    event.target.closest('.nav-item').classList.add('active');
    if (tab === 'home') closeUploadPanel();
};

// ========== مراقبة المستخدم ==========
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
    } else {
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});

console.log('✅ InstaPics Ready');
