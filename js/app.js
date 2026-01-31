/**
 * LocalChat - Main Application
 * 2025 Modern PWA with modular architecture
 */

// ==================== APP CONFIG ====================
const APP_CONFIG = {
  name: 'LocalChat',
  version: '1.0.0',
  dbName: 'LocalChatDB',
  storeName: 'logs'
};

// ==================== APP STATE ====================
const state = {
  user: {
    id: null,
    name: '',
    avatar: ''
  },
  isHost: false,
  isConnected: false,
  peers: {},
  currentScreen: 'login',
  isReady: false
};

// ==================== DOM ELEMENTS ====================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'info', duration = 3000) {
  const container = $('.toast-container') || createToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

// ==================== UI FUNCTIONS ====================
function showScreen(screenId) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const screen = $(`#screen-${screenId}`);
  if (screen) {
    screen.classList.add('active');
    state.currentScreen = screenId;
  }
}

function renderMessage(user, text, isMe, timestamp = null) {
  const container = $('#chat-view');
  if (!container) return;
  
  const row = document.createElement('div');
  row.className = `message-row ${isMe ? 'me' : 'them'}`;
  
  const timeStr = timestamp 
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  
  row.innerHTML = `
    ${!isMe ? `<div class="avatar avatar-sm" style="background-image: url('${escapeHtml(user.avatar)}')"></div>` : ''}
    <div class="message-content">
      ${!isMe ? `<div class="sender-name">${escapeHtml(user.name)}</div>` : ''}
      <div class="message-bubble">${escapeHtml(text)}</div>
      ${timeStr ? `<div class="message-time">${timeStr}</div>` : ''}
    </div>
  `;
  
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(text) {
  const container = $('#chat-view');
  if (!container) return;
  
  const msg = document.createElement('div');
  msg.className = 'system-msg';
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function updateConnectionStatus(status, isConnected = true) {
  const indicator = $('#status-indicator');
  if (indicator) {
    indicator.innerHTML = `${isConnected ? '●' : '○'} ${status}`;
    indicator.style.color = isConnected ? 'var(--success)' : 'var(--danger)';
  }
}

function updatePeerCount() {
  const count = Object.keys(state.peers).length;
  const btn = $('#btnManageUsers');
  if (btn) {
    btn.textContent = `👥 ${count}`;
  }
}

// ==================== AVATAR HANDLING ====================
window.handleAvatarInput = function(input) {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    state.user.avatar = e.target.result;
    const preview = $('#avatarPreview');
    if (preview) {
      preview.style.backgroundImage = `url(${state.user.avatar})`;
    }
  };
  reader.readAsDataURL(file);
};

window.saveProfile = async function() {
  const name = $('#username')?.value.trim();
  if (!name) {
    showToast('Please enter a username', 'error');
    return;
  }
  
  state.user.name = name;
  if (!state.user.avatar) {
    state.user.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
  }
  
  // Save to localStorage
  try {
    localStorage.setItem('localchat_user', JSON.stringify(state.user));
  } catch (e) {
    console.warn('Could not save user profile');
  }
  
  const lobbyWelcome = $('#lobby-welcome');
  if (lobbyWelcome) lobbyWelcome.textContent = `Hi, ${state.user.name}`;
  
  const lobbyAvatar = $('#lobbyAvatar');
  if (lobbyAvatar && state.user.avatar) {
    lobbyAvatar.style.backgroundImage = `url(${state.user.avatar})`;
  }
  
  showScreen('lobby');
};

// ==================== CHAT OPERATIONS ====================
window.sendMessage = function() {
  const input = $('#msgInput');
  const text = input?.value.trim();
  
  if (!text || !state.isConnected) return;
  
  renderMessage(state.user, text, true);
  
  const message = {
    type: 'chat',
    text,
    user: state.user
  };
  
  if (state.isHost) {
    broadcastMessage(message);
  } else if (webrtc?.channel) {
    webrtc.send('chat', { text, user: state.user });
  }
  
  input.value = '';
};

function broadcastMessage(message, excludeId = null) {
  if (!state.isHost || !webrtc) return;
  
  Object.entries(state.peers).forEach(([id, peer]) => {
    if (id !== excludeId && peer.channel?.readyState === 'open') {
      peer.channel.send(JSON.stringify(message));
    }
  });
}

// ==================== WEBRTC SETUP ====================
let webrtc = null;
let qrScanner = null;

window.initHost = async function() {
  state.isHost = true;
  state.isConnected = true;
  state.peers = {};
  
  showScreen('chat');
  const chatView = $('#chat-view');
  if (chatView) chatView.innerHTML = '';
  
  const btnAdd = $('#btnAddMember');
  const btnManage = $('#btnManageUsers');
  if (btnAdd) btnAdd.style.display = '';
  if (btnManage) btnManage.style.display = '';
  
  addSystemMessage('Group created. Share connection code to invite others.');
};

window.initJoin = async function() {
  state.isHost = false;
  state.isConnected = false;
  
  showScreen('chat');
  const chatView = $('#chat-view');
  if (chatView) chatView.innerHTML = '';
  
  await startScanner();
};

window.showInviteModal = async function() {
  if (!webrtc) {
    webrtc = new WebRTCManager();
    setupWebRTCHandlers();
  }
  
  const offerData = await webrtc.createOffer();
  
  // Show QR modal with offer
  const modal = $('#modal-qr');
  if (modal) modal.classList.add('active');
  
  const qrCanvas = $('#qr-canvas');
  const videoPreview = $('#video-preview');
  const scannerOverlay = $('#qr-scanner-overlay');
  const zoomControls = $('#zoom-controls');
  
  if (qrCanvas) qrCanvas.style.display = 'block';
  if (videoPreview) videoPreview.style.display = 'none';
  if (scannerOverlay) scannerOverlay.classList.remove('active');
  if (zoomControls) zoomControls.classList.remove('show');
  
  updateQRStatus('Generating connection code...', false);
  
  // Wait for ICE gathering
  webrtc.on('localDescriptionReady', async (description) => {
    const compressed = webrtc.compressDescription(description);
    
    if (typeof QRCode !== 'undefined' && qrCanvas) {
      QRCode.toCanvas(qrCanvas, compressed, { width: 220 });
    }
    
    updateQRStatus('Let guest scan this code', false);
    
    // Add button to scan guest's code
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Or scan guest\'s code';
    btn.style.marginTop = '10px';
    btn.onclick = async () => {
      await startScanner(webrtc);
      btn.remove();
    };
    const qrStatus = $('#qr-status');
    if (qrStatus) qrStatus.appendChild(btn);
  });
};

window.startScanner = async function(hostPC = null) {
  if (!qrScanner) {
    qrScanner = new QRScanner({
      onScan: async (data) => await handleScan(data, hostPC),
      onError: (error) => {
        console.error('Scanner error:', error);
      },
      onStatusChange: (status) => {
        updateQRStatus(status.text, status.showAnim);
      }
    });
  }
  
  const modal = $('#modal-qr');
  if (modal) modal.classList.add('active');
  
  const qrCanvas = $('#qr-canvas');
  const manualContainer = $('#manual-input-container');
  
  if (qrCanvas) qrCanvas.style.display = 'none';
  if (manualContainer) manualContainer.classList.remove('show');
  
  await qrScanner.start($('#video-preview'), $('#qr-scanner-overlay'));
};

async function handleScan(data, hostPC) {
  try {
    const signal = JSON.parse(LZString.decompressFromBase64(data));
    
    if (state.isHost && hostPC) {
      // Host receiving guest's answer
      await hostPC.handleAnswer(data);
      closeModal('modal-qr');
      addSystemMessage('Guest connected!');
    } else if (!state.isHost) {
      // Guest creating answer
      if (!webrtc) {
        webrtc = new WebRTCManager();
        setupWebRTCHandlers();
      }
      
      const answerData = await webrtc.createAnswer(data);
      
      qrScanner.stop();
      
      const qrCanvas = $('#qr-canvas');
      if (qrCanvas) {
        qrCanvas.style.display = 'block';
        QRCode.toCanvas(qrCanvas, answerData, { width: 220 });
      }
      
      updateQRStatus('Show this code to the host', false);
    }
  } catch (error) {
    console.error('Scan error:', error);
    showToast('Invalid connection code', 'error');
  }
}

window.handleManualCode = async function() {
  const code = $('#manual-code')?.value.trim();
  if (!code) {
    showToast('Please enter a connection code', 'error');
    return;
  }
  
  const result = await qrScanner?.handleManualCode(code);
  if (!result?.success) {
    showToast(result?.error || 'Invalid code', 'error');
  }
};

function setupWebRTCHandlers() {
  if (!webrtc) return;
  
  webrtc.onMessage = (msg) => {
    if (msg.type === 'chat') {
      renderMessage(msg.user, msg.text, false);
    } else if (msg.type === 'system') {
      addSystemMessage(msg.text);
    }
  };
  
  webrtc.onPeerJoin = (user) => {
    state.peers[Date.now()] = { user, channel: webrtc.channel };
    updatePeerCount();
    addSystemMessage(`${user.name} joined.`);
    broadcastMessage({ type: 'system', text: `${user.name} joined.` }, null);
  };
  
  webrtc.onPeerLeave = (userId) => {
    const peer = state.peers[userId];
    if (peer) {
      addSystemMessage(`${peer.user.name} disconnected.`);
      delete state.peers[userId];
      updatePeerCount();
    }
  };
  
  webrtc.onConnected = () => {
    state.isConnected = true;
    closeModal('modal-qr');
    updateConnectionStatus('Connected');
    addSystemMessage('Connected!');
    
    // Send identity
    webrtc.send('identity', { user: state.user });
  };
  
  webrtc.onDisconnected = () => {
    state.isConnected = false;
    updateConnectionStatus('Disconnected', false);
    showToast('Disconnected from host', 'error');
  };
  
  webrtc.onIdentityRequest = () => {
    webrtc.send('identity', { user: state.user });
  };
}

// ==================== PARTICIPANTS ====================
window.showParticipantsModal = function() {
  const list = $('#participants-list');
  const modal = $('#modal-users');
  
  if (!list || !modal) return;
  
  list.innerHTML = '';
  
  Object.entries(state.peers).forEach(([id, peer]) => {
    const item = document.createElement('div');
    item.className = 'participant-item';
    item.innerHTML = `
      <div class="participant-info">
        <div class="avatar avatar-sm" style="background-image: url('${escapeHtml(peer.user.avatar)}')"></div>
        <span>${escapeHtml(peer.user.name)}</span>
      </div>
      <button class="btn btn-danger" onclick="kickPeer('${id}')">Kick</button>
    `;
    list.appendChild(item);
  });
  
  modal.classList.add('active');
};

window.kickPeer = function(id) {
  const peer = state.peers[id];
  if (peer) {
    peer.channel?.send(JSON.stringify({ type: 'kick' }));
    peer.channel?.close();
    delete state.peers[id];
    showParticipantsModal();
    updatePeerCount();
  }
};

// ==================== HISTORY ====================
window.openHistory = async function() {
  showScreen('history');
  const list = $('#history-list');
  if (!list) return;
  
  list.innerHTML = '<div class="skeleton" style="height: 40px; margin: 10px;"></div>';
  
  try {
    await storage.init();
    const sessions = await storage.getBySession();
    
    list.innerHTML = '';
    
    if (sessions.length === 0) {
      list.innerHTML = '<p class="text-center" style="padding: 40px; color: var(--text-secondary);">No chat history yet</p>';
      return;
    }
    
    sessions.forEach(session => {
      const header = document.createElement('li');
      header.className = 'history-header';
      header.textContent = new Date(session.timestamp).toLocaleString();
      list.appendChild(header);
      
      session.logs.forEach(log => {
        const item = document.createElement('li');
        item.className = 'history-item';
        item.innerHTML = `
          <div class="history-meta">${new Date(log.timestamp).toLocaleTimeString()} - ${escapeHtml(log.sender)}</div>
          <div class="log-text" style="${log.isSystem ? 'font-style: italic; color: var(--text-secondary);' : ''}">${escapeHtml(log.text)}</div>
        `;
        list.appendChild(item);
      });
    });
  } catch (error) {
    console.error('History error:', error);
    list.innerHTML = '<p class="text-center" style="padding: 40px; color: var(--danger);">Failed to load history</p>';
  }
};

window.clearHistory = async function() {
  if (!confirm('Delete all chat logs permanently?')) return;
  
  try {
    await storage.init();
    await storage.clear();
    showToast('History cleared');
    openHistory();
  } catch (error) {
    showToast('Failed to clear history', 'error');
  }
};

// ==================== MODAL UTILS ====================
window.closeModal = function(modalId) {
  const modal = $(`#${modalId}`);
  if (modal) {
    modal.classList.remove('active');
  }
  
  if (modalId === 'modal-qr') {
    qrScanner?.reset();
  }
};

window.toggleManualInput = function() {
  const container = $('#manual-input-container');
  if (container) {
    container.classList.toggle('show');
    if (container.classList.contains('show')) {
      $('#manual-code')?.focus();
    }
  }
};

function updateQRStatus(text, showAnim) {
  const statusText = $('#qr-status-text');
  const statusDot = document.querySelector('.qr-status-anim');
  
  if (statusText) statusText.textContent = text;
  if (statusDot) statusDot.style.display = showAnim ? 'inline-block' : 'none';
}

// ==================== EXIT HANDLING ====================
window.confirmExit = function() {
  if (!confirm('Leave the group?')) return;
  
  if (state.isHost) {
    broadcastMessage({ type: 'close' });
  } else if (webrtc) {
    webrtc.send('leave', { userId: state.user.id });
  }
  
  cleanupAndReload();
};

function cleanupAndReload() {
  webrtc?.destroy();
  qrScanner?.stop();
  state.isConnected = false;
  window.location.reload();
}

// ==================== INITIALIZATION ====================
async function initApp() {
  console.log(`[${APP_CONFIG.name}] Initializing v${APP_CONFIG.version}`);
  
  // Load stored user profile
  try {
    const stored = localStorage.getItem('localchat_user');
    if (stored) {
      state.user = JSON.parse(stored);
      $('#username').value = state.user.name;
      if (state.user.avatar) {
        $('#avatarPreview').style.backgroundImage = `url(${state.user.avatar})`;
      }
    } else {
      // Generate ID
      state.user.id = crypto.randomUUID();
    }
  } catch (e) {
    console.warn('Could not load user profile');
    state.user.id = crypto.randomUUID();
  }
  
  // Initialize storage
  try {
    await storage.init();
    console.log('[App] Storage initialized');
  } catch (e) {
    console.error('[App] Storage init failed:', e);
  }
  
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      console.log('[App] Service Worker registered:', registration.scope);
    } catch (e) {
      console.warn('[App] Service Worker registration failed:', e);
    }
  }
  
  state.isReady = true;
  console.log('[App] Ready');
}

// ==================== UTILITIES ====================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== EXPORTS ====================
window.LocalChat = {
  config: APP_CONFIG,
  state,
  showToast,
  showScreen,
  renderMessage,
  addSystemMessage,
  sendMessage,
  initHost,
  initJoin,
  closeModal,
  confirmExit,
  openHistory,
  clearHistory,
  showParticipantsModal,
  kickPeer,
  handleManualCode,
  toggleManualInput
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initApp);
