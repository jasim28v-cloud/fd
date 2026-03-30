import { auth, db, ref, push, set, onValue, update, get, child, CLOUD_NAME, UPLOAD_PRESET } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ========== المتغيرات العامة ==========
let currentUser = null;
let currentUserData = null;
let allUsers = {};
let allPosts = [];
let selectedImageFile = null;
let currentChatUserId = null;
let viewingProfileUserId = null;
let currentModalPost = null;
let mediaRecorder = null;
let unreadNotifications = 0;

// ========== إعدادات الأدمن ==========
const ADMIN_EMAILS = ['jasim28v@gmail.com'];
let isAdmin = false;

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
            username, email, bio: '', avatarUrl: '', coverUrl: '', followers: {}, following: {}, totalLikes: 0, createdAt: Date.now()
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

// ========== المودال ==========
window.openModal = function(post) {
    currentModalPost = post;
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
    likeBtn.innerHTML = `<i class="far fa-heart"></i> <span>${post.likes || 0}</span>`;
    likeBtn.className = `modal-action ${isLiked ? 'active' : ''}`;
    likeBtn.onclick = () => toggleLikeModal();
    
    renderComments();
    document.getElementById('imageModal').classList.add('active');
};

function renderComments() {
    const container = document.getElementById('modalCommentsList');
    if (!currentModalPost) return;
    const comments = currentModalPost.comments || {};
    container.innerHTML = '';
    Object.values(comments).reverse().forEach(c => {
        const user = allUsers[c.userId] || { username: c.username || 'user' };
        container.innerHTML += `
            <div class="comment-item">
                <div class="comment-username">${user.username}</div>
                <div>${c.text}</div>
            </div>
        `;
    });
}

window.toggleLikeModal = async function() {
    if (!currentUser || !currentModalPost) return;
    const postRef = ref(db, `posts/${currentModalPost.id}`);
    const snap = await get(postRef);
    const post = snap.val();
    let likes = post.likes || 0;
    let likedBy = post.likedBy || {};
    if (likedBy[currentUser.uid]) {
        likes--; delete likedBy[currentUser.uid];
    } else {
        likes++; likedBy[currentUser.uid] = true;
        showHeartAnimation();
        await addNotification(post.sender, 'like');
    }
    await update(postRef, { likes, likedBy });
    currentModalPost.likes = likes;
    currentModalPost.likedBy = likedBy;
    document.getElementById('modalLikes').innerText = likes;
    const isLiked = likedBy[currentUser.uid];
    const likeBtn = document.getElementById('modalLikeBtn');
    likeBtn.innerHTML = `<i class="far fa-heart"></i> <span>${likes}</span>`;
    likeBtn.className = `modal-action ${isLiked ? 'active' : ''}`;
    renderFeed();
};

function showHeartAnimation() {
    const heart = document.createElement('div');
    heart.className = 'heart-animation';
    heart.innerHTML = '❤️';
    heart.style.left = (window.innerWidth / 2) + 'px';
    heart.style.top = (window.innerHeight / 2) + 'px';
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 600);
}

window.addComment = async function() {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text || !currentModalPost) return;
    const comment = {
        userId: currentUser.uid,
        username: currentUserData?.username,
        text: text,
        timestamp: Date.now()
    };
    await push(ref(db, `posts/${currentModalPost.id}/comments`), comment);
    await addNotification(currentModalPost.sender, 'comment');
    if (!currentModalPost.comments) currentModalPost.comments = {};
    const newId = Date.now();
    currentModalPost.comments[newId] = comment;
    renderComments();
    input.value = '';
    document.getElementById('modalComments').innerText = Object.keys(currentModalPost.comments).length;
    renderFeed();
};

window.sharePost = function() {
    if (navigator.share) navigator.share({ title: 'InstaPics', url: currentModalPost?.imageUrl });
    else { navigator.clipboard.writeText(currentModalPost?.imageUrl); alert('✅ تم نسخ الرابط'); }
};

window.openMessageFromModal = function() {
    if (currentModalPost) openPrivateChat(currentModalPost.sender);
};

window.closeModal = function() {
    document.getElementById('imageModal').classList.remove('active');
    currentModalPost = null;
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

// ========== الملف الشخصي ==========
window.openMyProfile = function() { viewProfile(currentUser.uid); };
window.viewProfile = async function(userId) {
    if (!userId) return;
    viewingProfileUserId = userId;
    await loadProfileData(userId);
    document.getElementById('profilePanel').classList.add('open');
};
window.closeProfile = function() { document.getElementById('profilePanel').classList.remove('open'); viewingProfileUserId = null; };

async function loadProfileData(userId) {
    const userSnap = await get(child(ref(db), `users/${userId}`));
    const user = userSnap.val();
    if (!user) return;
    // الغلاف
    const coverEl = document.getElementById('profileCover');
    if (user.coverUrl) coverEl.style.background = `url(${user.coverUrl}) center/cover`;
    else coverEl.style.background = 'linear-gradient(135deg, #ec489a, #3b82f6)';
    // الصورة الشخصية
    document.getElementById('profileAvatar').innerHTML = user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.username?.charAt(0) || '👤');
    document.getElementById('profileName').innerText = user.username;
    document.getElementById('profileBio').innerText = user.bio || '';
    
    const userPosts = allPosts.filter(p => p.sender === userId);
    document.getElementById('profilePostsCount').innerText = userPosts.length;
    document.getElementById('profileFollowersCount').innerText = Object.keys(user.followers || {}).length;
    document.getElementById('profileFollowingCount').innerText = Object.keys(user.following || {}).length;
    
    const grid = document.getElementById('profilePostsGrid');
    grid.innerHTML = userPosts.map(p => `<div class="aspect-square bg-gray-100 cursor-pointer" onclick="openModal(p)"><img src="${p.imageUrl}" class="w-full h-full object-cover"></div>`).join('');
    
    const buttonsDiv = document.getElementById('profileButtons');
    buttonsDiv.innerHTML = '';
    if (userId === currentUser.uid) {
        buttonsDiv.innerHTML = `<button class="profile-btn profile-btn-primary" onclick="openEditProfile()">تعديل الملف</button><button class="profile-btn profile-btn-secondary" onclick="logout()">تسجيل خروج</button>`;
    } else {
        const isFollowing = currentUserData?.following && currentUserData.following[userId];
        buttonsDiv.innerHTML = `<button class="profile-btn profile-btn-primary" onclick="toggleFollow('${userId}', this)">${isFollowing ? 'متابع' : 'متابعة'}</button>
                                <button class="profile-btn profile-btn-secondary" onclick="openPrivateChat('${userId}')"><i class="fas fa-envelope"></i> مراسلة</button>`;
    }
    
    const adminPanel = document.getElementById('adminPanel');
    if (isAdmin && userId === currentUser.uid) {
        adminPanel.style.display = 'block';
        await loadAdminPanel();
    } else {
        adminPanel.style.display = 'none';
    }
}

async function loadAdminPanel() {
    const statsDiv = document.getElementById('adminStats');
    const usersListDiv = document.getElementById('adminUsersList');
    statsDiv.innerHTML = `
        <div class="admin-stat"><div class="font-bold text-lg">${Object.keys(allUsers).length}</div><div>مستخدمين</div></div>
        <div class="admin-stat"><div class="font-bold text-lg">${allPosts.length}</div><div>منشورات</div></div>
        <div class="admin-stat"><div class="font-bold text-lg">${allPosts.reduce((s,p)=>s+(p.likes||0),0)}</div><div>إجمالي الإعجابات</div></div>
    `;
    usersListDiv.innerHTML = '<h4 class="font-bold mt-3">إدارة المستخدمين</h4>';
    Object.entries(allUsers).forEach(([uid, u]) => {
        if (uid !== currentUser.uid) {
            usersListDiv.innerHTML += `<div class="flex justify-between items-center p-2 border-b"><span>@${u.username}</span><button class="admin-delete-btn" onclick="adminDeleteUser('${uid}')">حذف</button></div>`;
        }
    });
}

window.adminDeleteUser = async function(userId) {
    if (!isAdmin) return;
    if (confirm('حذف هذا المستخدم وجميع منشوراته؟')) {
        const posts = allPosts.filter(p => p.sender === userId);
        for (const post of posts) {
            await set(ref(db, `posts/${post.id}`), null);
        }
        await set(ref(db, `users/${userId}`), null);
        alert('✅ تم حذف المستخدم');
        location.reload();
    }
};

window.openEditProfile = function() {
    const newUsername = prompt('اسم المستخدم الجديد:', currentUserData?.username);
    const newBio = prompt('السيرة الذاتية:', currentUserData?.bio || '');
    if (newUsername) update(ref(db, `users/${currentUser.uid}`), { username: newUsername });
    if (newBio !== null) update(ref(db, `users/${currentUser.uid}`), { bio: newBio });
    if (newUsername || newBio !== null) location.reload();
};
window.changeAvatar = function() { document.getElementById('avatarInput').click(); };
window.changeCover = function() { document.getElementById('coverInput').click(); };
document.getElementById('avatarInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    await update(ref(db, `users/${currentUser.uid}`), { avatarUrl: data.secure_url });
    location.reload();
});
document.getElementById('coverInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    await update(ref(db, `users/${currentUser.uid}`), { coverUrl: data.secure_url });
    location.reload();
});
const avatarInput = document.createElement('input');
avatarInput.type = 'file';
avatarInput.accept = 'image/*';
avatarInput.id = 'avatarInput';
avatarInput.style.display = 'none';
document.body.appendChild(avatarInput);
const coverInput = document.createElement('input');
coverInput.type = 'file';
coverInput.accept = 'image/*';
coverInput.id = 'coverInput';
coverInput.style.display = 'none';
document.body.appendChild(coverInput);

// ========== المتابعة ==========
window.toggleFollow = async function(userId, btn) {
    if (!currentUser || currentUser.uid === userId) return;
    const userRef = ref(db, `users/${currentUser.uid}/following/${userId}`);
    const targetRef = ref(db, `users/${userId}/followers/${currentUser.uid}`);
    const snap = await get(userRef);
    if (snap.exists()) {
        await set(userRef, null); await set(targetRef, null); btn.innerText = 'متابعة';
        await addNotification(userId, 'unfollow');
    } else {
        await set(userRef, true); await set(targetRef, true); btn.innerText = 'متابع';
        await addNotification(userId, 'follow');
    }
    if (viewingProfileUserId === userId) await loadProfileData(userId);
};

// ========== الإشعارات ==========
async function addNotification(targetUserId, type) {
    if (targetUserId === currentUser.uid) return;
    const fromUser = currentUserData;
    const messages = { like: 'أعجب بصورتك', comment: 'علق على صورتك', follow: 'بدأ بمتابعتك', unfollow: 'توقف عن متابعتك' };
    await push(ref(db, `notifications/${targetUserId}`), {
        type, fromUserId: currentUser.uid, fromUsername: fromUser.username, message: messages[type], timestamp: Date.now(), read: false
    });
    updateNotificationBadge();
}

function updateNotificationBadge() {
    onValue(ref(db, `notifications/${currentUser?.uid}`), (snap) => {
        const notifs = snap.val() || {};
        const unread = Object.values(notifs).filter(n => !n.read).length;
        const icon = document.getElementById('notifIcon');
        if (unread > 0) {
            icon.innerHTML = `<i class="fas fa-heart text-pink-500"></i><span class="notification-badge">${unread}</span>`;
        } else {
            icon.innerHTML = '<i class="far fa-heart"></i>';
        }
    });
}

window.openNotifications = async function() {
    const panel = document.getElementById('notificationsPanel');
    const snap = await get(child(ref(db), `notifications/${currentUser.uid}`));
    const notifs = snap.val() || {};
    const container = document.getElementById('notificationsList');
    container.innerHTML = '';
    Object.values(notifs).reverse().forEach(n => {
        container.innerHTML += `<div class="notification-item"><i class="fas ${n.type === 'like' ? 'fa-heart text-pink-500' : n.type === 'comment' ? 'fa-comment text-blue-500' : 'fa-user-plus text-green-500'}"></i><div><div class="font-bold">${n.fromUsername}</div><div class="text-sm text-gray-500">${n.message}</div></div></div>`;
        if (!n.read) update(ref(db, `notifications/${currentUser.uid}/${Object.keys(notifs).find(k => notifs[k] === n)}`), { read: true });
    });
    panel.classList.add('open');
    updateNotificationBadge();
};
window.closeNotifications = function() { document.getElementById('notificationsPanel').classList.remove('open'); };

// ========== الدردشة الخاصة ==========
function getChatId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }

window.openConversations = async function() {
    const panel = document.getElementById('conversationsPanel');
    const container = document.getElementById('conversationsList');
    const userId = currentUser.uid;
    const convSnap = await get(child(ref(db), `private_chats/${userId}`));
    const conversations = convSnap.val() || {};
    container.innerHTML = '';
    for (const [otherId, convData] of Object.entries(conversations)) {
        const otherUser = allUsers[otherId];
        if (!otherUser) continue;
        const lastMsg = convData.lastMessage || '';
        container.innerHTML += `<div class="conversation-item" onclick="openPrivateChat('${otherId}')"><div class="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center">${otherUser.avatarUrl ? `<img src="${otherUser.avatarUrl}" class="w-full h-full rounded-full">` : (otherUser.username?.charAt(0) || 'U')}</div><div><div class="font-bold">${otherUser.username}</div><div class="text-sm text-gray-500">${lastMsg.substring(0, 40)}</div></div></div>`;
    }
    if (container.innerHTML === '') container.innerHTML = '<div class="text-center text-gray-500 py-10">لا توجد محادثات بعد</div>';
    panel.classList.add('open');
};
window.closeConversations = function() { document.getElementById('conversationsPanel').classList.remove('open'); };
window.openPrivateChat = async function(otherUserId) {
    currentChatUserId = otherUserId;
    const user = allUsers[otherUserId];
    document.getElementById('chatUserName').innerText = user?.username || 'مستخدم';
    document.getElementById('chatAvatar').innerHTML = user?.avatarUrl ? `<img src="${user.avatarUrl}" class="w-full h-full rounded-full">` : (user?.username?.charAt(0) || 'U');
    await loadPrivateMessages(otherUserId);
    document.getElementById('chatPanel').classList.add('open');
    closeConversations();
};
window.closeChat = function() { document.getElementById('chatPanel').classList.remove('open'); currentChatUserId = null; };
async function loadPrivateMessages(otherUserId) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '<div class="text-center text-gray-500 py-10">جاري التحميل...</div>';
    const chatId = getChatId(currentUser.uid, otherUserId);
    const messagesSnap = await get(child(ref(db), `private_messages/${chatId}`));
    const messages = messagesSnap.val() || {};
    container.innerHTML = '';
    const sorted = Object.entries(messages).sort((a,b)=>a[1].timestamp-b[1].timestamp);
    for (const [id, msg] of sorted) {
        const isSent = msg.senderId === currentUser.uid;
        const time = new Date(msg.timestamp).toLocaleTimeString();
        let content = '';
        if (msg.type === 'text') content = `<div class="message-bubble ${isSent ? 'sent' : 'received'}">${msg.text}</div>`;
        else if (msg.type === 'image') content = `<img src="${msg.imageUrl}" class="message-image max-w-[200px] rounded-lg cursor-pointer" onclick="window.open('${msg.imageUrl}')">`;
        else if (msg.type === 'audio') content = `<div class="message-audio"><audio controls><source src="${msg.audioUrl}" type="audio/mp3"></audio></div>`;
        container.innerHTML += `<div class="chat-message ${isSent ? 'sent' : 'received'}"><div>${content}<div class="text-[10px] opacity-50 mt-1">${time}</div></div></div>`;
    }
    if (container.innerHTML === '') container.innerHTML = '<div class="text-center text-gray-500 py-10">لا توجد رسائل بعد</div>';
    container.scrollTop = container.scrollHeight;
}
window.sendChatMessage = async function() {
    const input = document.getElementById('chatMessageInput');
    const text = input.value.trim();
    if (!text || !currentChatUserId) return;
    const chatId = getChatId(currentUser.uid, currentChatUserId);
    await push(ref(db, `private_messages/${chatId}`), { senderId: currentUser.uid, senderName: currentUserData?.username, text, type: 'text', timestamp: Date.now() });
    await set(ref(db, `private_chats/${currentUser.uid}/${currentChatUserId}`), { lastMessage: text, lastTimestamp: Date.now(), withUser: currentChatUserId });
    await set(ref(db, `private_chats/${currentChatUserId}/${currentUser.uid}`), { lastMessage: text, lastTimestamp: Date.now(), withUser: currentUser.uid });
    input.value = '';
    await loadPrivateMessages(currentChatUserId);
};
window.sendChatImage = async function(input) {
    const file = input.files[0];
    if (!file || !currentChatUserId) return;
    const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    const chatId = getChatId(currentUser.uid, currentChatUserId);
    await push(ref(db, `private_messages/${chatId}`), { senderId: currentUser.uid, senderName: currentUserData?.username, imageUrl: data.secure_url, type: 'image', timestamp: Date.now() });
    await set(ref(db, `private_chats/${currentUser.uid}/${currentChatUserId}`), { lastMessage: '📷 صورة', lastTimestamp: Date.now(), withUser: currentChatUserId });
    await set(ref(db, `private_chats/${currentChatUserId}/${currentUser.uid}`), { lastMessage: '📷 صورة', lastTimestamp: Date.now(), withUser: currentUser.uid });
    input.value = '';
    await loadPrivateMessages(currentChatUserId);
};

// ========== تسجيل الصوت ==========
let mediaRecorderInstance = null;
let audioChunksList = [];

window.startRecording = async function() {
    const btn = document.getElementById('recordBtn');
    if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') {
        mediaRecorderInstance.stop();
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderInstance = new MediaRecorder(stream);
        audioChunksList = [];
        mediaRecorderInstance.ondataavailable = (event) => {
            audioChunksList.push(event.data);
        };
        mediaRecorderInstance.onstop = async () => {
            const audioBlob = new Blob(audioChunksList, { type: 'audio/mp3' });
            const fd = new FormData();
            fd.append('file', audioBlob, 'audio.mp3');
            fd.append('upload_preset', UPLOAD_PRESET);
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`, { method: 'POST', body: fd });
            const data = await res.json();
            if (currentChatUserId) {
                const chatId = getChatId(currentUser.uid, currentChatUserId);
                await push(ref(db, `private_messages/${chatId}`), { senderId: currentUser.uid, senderName: currentUserData?.username, audioUrl: data.secure_url, type: 'audio', timestamp: Date.now() });
                await set(ref(db, `private_chats/${currentUser.uid}/${currentChatUserId}`), { lastMessage: '🎤 رسالة صوتية', lastTimestamp: Date.now(), withUser: currentChatUserId });
                await set(ref(db, `private_chats/${currentChatUserId}/${currentUser.uid}`), { lastMessage: '🎤 رسالة صوتية', lastTimestamp: Date.now(), withUser: currentUser.uid });
                await loadPrivateMessages(currentChatUserId);
            }
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorderInstance.start();
        btn.innerHTML = '<i class="fas fa-stop-circle text-red-500"></i>';
    } catch (err) {
        alert('لا يمكن الوصول إلى الميكروفون');
    }
};

// ========== البحث ==========
window.openSearch = function() { alert('ميزة البحث قيد التطوير'); };

// ========== التنقل ==========
window.switchTab = function(tab) {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    event.target.closest('.nav-item').classList.add('active');
    if (tab === 'home') { closeUploadPanel(); closeProfile(); closeChat(); closeConversations(); closeNotifications(); }
};

// ========== مراقبة المستخدم ==========
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        isAdmin = ADMIN_EMAILS.includes(currentUser.email);
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        updateNotificationBadge();
    } else {
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});

console.log('✅ InstaPics Ready');
