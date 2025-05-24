// ===== CONFIGURATION =====
const config = {
  miningRate: 1, // tokens per minute
  sessionDuration: 3600 // 60 minutes in seconds
};

// ===== ÉTAT GLOBAL =====
let state = {
  tg: null,
  userId: null,
  deviceId: null,
  balance: 0,
  tokens: 0,
  miningInterval: null,
  sessionStart: Date.now(),
  currentPage: 'content'
};

// ===== INITIALISATION =====
function initApp() {
  initTelegramWebApp();
  initNavigation();
  loadUserData();
  showPage(state.currentPage);
}

function initTelegramWebApp() {
  if (window.Telegram?.WebApp) {
    state.tg = Telegram.WebApp;
    state.tg.expand();
    state.userId = state.tg.initDataUnsafe?.user?.id.toString();
    state.deviceId = generateDeviceId();
    setupTheme();
  } else {
    // Mode développement
    state.tg = { WebApp: { initDataUnsafe: { user: { id: "test_user", username: "TestUser" } } } };
    state.userId = "test_user";
    state.deviceId = "test_device_" + Math.random().toString(36).slice(2);
  }
}

function generateDeviceId() {
  return `${navigator.userAgent}-${state.userId}`.replace(/\s+/g, '_');
}

function setupTheme() {
  if (state.tg) {
    state.tg.backgroundColor = "#1a1a1a";
    state.tg.headerColor = "#1a1a1a";
    state.tg.setHeaderColor("#1a1a1a");
  }
}

// ===== GESTION DES PAGES =====
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      showPage(target);
    });
  });
}

function showPage(pageId) {
  // Masquer toutes les pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.add('hidden');
  });

  // Afficher la page cible
  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.remove('hidden');
    state.currentPage = pageId;
    updateNavButtons();
    
    // Charger le contenu spécifique
    switch(pageId) {
      case 'content':
        showClaim();
        break;
      case 'tasks-page':
        loadTasks();
        break;
      case 'referrals-page':
        loadReferrals();
        break;
    }
  }
}

function updateNavButtons() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === state.currentPage);
  });
}

// ===== MINAGE =====
function showClaim() {
  document.getElementById('content').innerHTML = `
    <div class="claim-container">
      <div class="token-display">
        <span id="tokens">0.00</span>
        <span class="token-unit">tokens</span>
      </div>
      <button id="main-claim-btn" class="mc-action-button" disabled>
        <span id="claim-text">10:00</span>
        <div class="mining-progress-bar"></div>
      </button>
    </div>
  `;

  document.getElementById('main-claim-btn').addEventListener('click', handleClaim);
  startMining();
}

function startMining() {
  if (state.miningInterval) clearInterval(state.miningInterval);
  
  state.miningInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - state.sessionStart) / 1000;
    const maxTokens = config.sessionDuration / 60 * config.miningRate;
    
    state.tokens = Math.min(elapsed * (config.miningRate / 60), maxTokens);
    updateMiningDisplay();
    
    // Sauvegarde locale
    saveSession();
    
    // Synchronisation serveur
    syncWithServer();
  }, 1000);
}

function updateMiningDisplay() {
  const btn = document.getElementById('main-claim-btn');
  const tokensDisplay = document.getElementById('tokens');
  const claimText = document.getElementById('claim-text');
  
  if (!btn || !tokensDisplay || !claimText) return;

  const elapsed = (Date.now() - state.sessionStart) / 1000;
  const remaining = Math.max(0, config.sessionDuration - elapsed);
  
  tokensDisplay.textContent = state.tokens.toFixed(2);
  
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  claimText.textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  
  btn.disabled = remaining > 600; // Désactivé si > 10 minutes restantes
}

// ===== TÂCHES ET PARRAINAGE =====
async function loadTasks() {
  try {
    const response = await fetch('/api/tasks');
    const tasks = await response.json();
    
    let html = tasks.map(task => `
      <div class="task-card">
        <img src="${task.icon || './images/task_default.png'}" class="task-icon">
        <div>
          <h3>${task.title}</h3>
          <p>${task.description}</p>
          <p class="task-reward">Reward: ${task.reward} tokens</p>
        </div>
        <button class="mc-action-button" data-task="${task.id}">
          Start
        </button>
      </div>
    `).join('');
    
    document.getElementById('tasks-content').innerHTML = html || '<p>No tasks available</p>';
  } catch (error) {
    showError('tasks-content', 'Failed to load tasks');
  }
}

async function loadReferrals() {
  try {
    const response = await fetch('/api/referrals');
    const data = await response.json();
    
    document.getElementById('referrals-content').innerHTML = `
      <div class="referral-code glowing-text">
        ${data.code || 'REF-CODE'}
      </div>
      <p>Share your code to earn 10% of your referrals' earnings!</p>
      <button class="mc-action-button" onclick="copyToClipboard('${data.code}')">
        <i class="fas fa-copy"></i> Copy Code
      </button>
      <div class="referral-stats">
        <div>Total Referrals: ${data.count || 0}</div>
        <div>Earned: ${data.earned || 0} tokens</div>
      </div>
    `;
  } catch (error) {
    showError('referrals-content', 'Failed to load referrals data');
  }
}

// ===== UTILITAIRES =====
function showError(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = `<div class="error-state">${message}</div>`;
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showNotification('Code copied!');
}

function showNotification(message) {
  const notif = document.getElementById('notification');
  if (notif) {
    notif.textContent = message;
    notif.classList.remove('hidden');
    setTimeout(() => notif.classList.add('hidden'), 3000);
  }
}

// ===== DÉMARRAGE =====
document.addEventListener('DOMContentLoaded', initApp);