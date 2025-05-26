// Variables globales
let tg, userId;
let balance = 0;
let miningInterval;
let sessionStartTime = Date.now();
let tokens = 0;
let deviceId;
let Mining_Speed = 1;
deviceId = generateDeviceId();

// ==============================================
// GESTION DE SESSION
// ==============================================
function generateDeviceId() {
  return 'device_' + Math.random().toString(36).substr(2, 9);
}

function sauvegarderSession() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('miningSession', JSON.stringify({
      sessionStartTime,
      tokens,
      userId,
      deviceId
    }));
  }
}

async function chargerSession() {
  if (typeof localStorage !== 'undefined' && userId && deviceId) {
    const session = localStorage.getItem('miningSession');
    if (session) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.userId === userId && parsed.deviceId === deviceId) {
          sessionStartTime = parsed.sessionStartTime;
          tokens = parsed.tokens;
          
          // Vérifier si la session est encore valide (moins de 60 minutes)
          const elapsedMinutes = (Date.now() - sessionStartTime) / (1000 * 60);
          if (elapsedMinutes < 60) {
            return true;
          }
        }
      } catch (e) {
        console.error('Error parsing session:', e);
      }
    }
  }
  
  // Si on arrive ici, la session est invalide ou inexistante
  localStorage.removeItem('miningSession');
  return false;
}

// ==============================================
// FONCTIONS PRINCIPALES
// ==============================================

async function initTelegramWebApp() {
  if (!window.Telegram?.WebApp) {
    console.error('Telegram WebApp SDK not loaded');
    return;
  }

  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();

  const user = window.Telegram.WebApp.initDataUnsafe?.user || {};
  userId = user.id || null;
  deviceId = deviceId || generateDeviceId();

  // Initialiser l'UI de base
  updateUserInfo({
    username: user.username || "Utilisateur",
    balance: "0"
  });

  // Afficher le contenu de base
  showClaim();
}

window.addEventListener('DOMContentLoaded', async () => {
  await initTelegramWebApp();
  initParticles();
  initNavigation();
  
  if (userId) {
  try {
    const userData = await loadUserData();
    Mining_Speed = userData.mining_speed || 1;
    updateUserInfo(userData);

    // Essayer de synchroniser avec le serveur d'abord
    const serverSessionValid = await syncWithServer();
    
    // Si pas de session serveur, essayer le local storage
    if (!serverSessionValid && !(await chargerSession())) {
      await startNewSession();
    }
    
    await demarrerMinage();
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

  showClaim();
});

function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      if (this.id === 'nav-claim') showClaim();
      if (this.id === 'nav-tasks') loadTasks();
      if (this.id === 'nav-referral') loadReferrals();
    });
  });
  
  // Charger la page initiale
  showClaim();
}

function updateUserInfo({ username }) {
  const usernameEl = document.getElementById('username');
  const balanceEl = document.getElementById('balance');
  const speedEl = document.getElementById('mining-speed');

  if (usernameEl && username !== undefined) usernameEl.textContent = username;
  if (balanceEl) balanceEl.textContent = balance;
  if (speedEl) speedEl.textContent = `Vitesse de minage : x${Mining_Speed}`;
}

async function syncWithServer() {
  try {
    const response = await fetch('/check-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, deviceId })
    });

    const data = await response.json();
    
    if (data.valid) {
      // Mettre à jour les valeurs locales avec celles du serveur
      sessionStartTime = data.startTime;
      tokens = data.tokens || 0;
      return true;
    }
  } catch (error) {
    console.error('Sync error:', error);
  }
  return false;
}
// ==============================================
// FONCTIONS MINAGE
// ==============================================

async function demarrerMinage() {
  clearInterval(miningInterval);
  let lastUpdate = Date.now();

  miningInterval = setInterval(() => {
    const now = Date.now();
    const elapsedMs = now - lastUpdate;
    lastUpdate = now;

    const elapsedMinutes = (now - sessionStartTime) / (1000 * 60);
    if (elapsedMinutes >= 60) {
      clearInterval(miningInterval);
      return;
    }

    // Calcul des tokens gagnés
    const newTokens = (elapsedMs / 60000) * Mining_Speed;
    tokens = Math.min(tokens + newTokens, 60 * Mining_Speed); // Plafond à 60 tokens

    // Sauvegarde et mise à jour
    sauvegarderSession();
    updateDisplay();

  }, 1000);
}

  // Mise à jour initiale
  updateDisplay();
}


async function startNewSession() {
  try {
    const response = await fetch('/start-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, deviceId })
    });

    if (!response.ok) throw new Error('Failed to start session');

    sessionStartTime = Date.now();
    tokens = 0;
    await demarrerMinage();
    
  } catch (error) {
    console.error('Session error:', error);
    showErrorState();
  }
}

// ==============================================
// FONCTIONS CLAIM
// ==============================================

async function handleClaim() {
  const btn = document.getElementById('main-claim-btn');
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<div class="spinner-mini"></div>';

  try {
    const elapsedMinutes = (Date.now() - sessionStartTime) / (1000 * 60);
    const tokensToClaim = Math.floor(tokens);

    if (tokensToClaim < 1) throw new Error('NOTHING_TO_CLAIM');

    const response = await fetch('/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      },
      body: JSON.stringify({
        userId,
        deviceId,
        tokens: tokensToClaim,
        miningTime: elapsedMinutes,
        username: window.Telegram?.WebApp?.initDataUnsafe?.user?.username
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'CLAIM_FAILED');
    }

    const result = await response.json();
    
    // Réinitialisation après claim
    tokens = 0;
    sessionStartTime = Date.now();
    
    // Mise à jour UI
    if (result.balance !== undefined) {
  balance = result.balance; // Mettre à jour la variable globale
  updateUserInfo({ balance: result.balance.toString(), username: user.username });
}
    
    btn.innerHTML = `<span style="color:#4CAF50">✓ ${tokensToClaim} tokens claimés</span>`;
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      updateDisplay();
    }, 2000);

  } catch (error) {
    console.error('Claim error:', error);
    btn.innerHTML = `<span style="color:#FF5252">⚠️ ${error.message === 'NOTHING_TO_CLAIM' ? 'Min 1 token requis' : 'Erreur'}</span>`;
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 3000);
  }
}

function updateDisplay() {
  const now = Date.now();
  const elapsedSeconds = (now - sessionStartTime) / 1000;
  const maxTime = 3600; // 1h session max
  const remainingSeconds = Math.max(0, maxTime - elapsedSeconds);

  // Arrêter le minage si le temps est écoulé
  if (remainingSeconds <= 0) {
    clearInterval(miningInterval);
  }

  // Formatage du temps
  const mins = Math.floor(remainingSeconds / 60);
  const secs = Math.floor(remainingSeconds % 60);
  const timeString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  // Mise à jour des éléments UI
  const tokensEl = document.getElementById('tokens');
  const claimTextEl = document.getElementById('claim-text');
  const btn = document.getElementById('main-claim-btn');

  if (tokensEl) {
    tokensEl.textContent = tokens.toFixed(2);
    tokensEl.style.animation = 'none';
    setTimeout(() => {
      tokensEl.style.animation = 'pulse 0.5s';
    }, 10);
  }

  if (claimTextEl) {
    claimTextEl.textContent = timeString;
  }

  if (btn) {
    btn.disabled = tokens < 1 || remainingSeconds <= 0;
    
    // Mise à jour de la barre de progression
    const progress = (elapsedSeconds / maxTime) * 100;
    const progressBar = btn.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.style.width = `${Math.min(100, progress)}%`;
    }
  }
}

// ==============================================
// FONCTIONS PAGES
// ==============================================

function showClaim() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-container">
      <div class="token-display">
        <span id="tokens">${tokens.toFixed(2)}</span>
        <span class="token-unit">tokens</span>
      </div>
      <div id="mining-speed">Vitesse de minage: x${Mining_Speed}</div>
      <button id="main-claim-btn" class="mc-button-anim" disabled>
        <span id="claim-text">00:00</span>
        <div class="progress-bar"></div>
      </button>
    </div>
  `;
  
  // Réattacher l'événement
  document.getElementById('main-claim-btn').addEventListener('click', handleClaim);
  
  // Forcer la mise à jour initiale
  updateDisplay();
}

async function loadReferrals() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loader">Chargement...</div>';

  try {
    const response = await fetch('/api/referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();

    content.innerHTML = `
      <div class="referral-card">
        <h2>Programme de Parrainage</h2>
        <div class="referral-section">
          <h3>Lien de Parrainage</h3>
          <div class="referral-url">${data.referralUrl}</div>
          <button onclick="copyToClipboard('${data.referralUrl}')">Copier</button>
        </div>
        <div class="referral-stats">
          <div class="stat-item">
            <span>Filleuls</span>
            <strong>${data.totalReferrals || 0}</strong>
          </div>
          <div class="stat-item">
            <span>Gains</span>
            <strong>${data.totalEarned || 0} tokens</strong>
          </div>
        </div>
      </div>
    `;

  } catch (error) {
    content.innerHTML = `
      <div class="error">
        <p>Erreur de chargement</p>
        <button onclick="loadReferrals()">Réessayer</button>
      </div>
    `;
  }
}

async function loadTasks() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loader">Chargement...</div>';

  try {
    const response = await fetch('/api/tasks');
    if (!response.ok) throw new Error('Failed to load tasks');
    
    const tasks = await response.json();
    content.innerHTML = tasks.length ? `
      <div class="tasks-container">
        ${tasks.map(task => `
          <div class="task-item">
            <h3>${task.title}</h3>
            ${task.image ? `<img src="${task.image}">` : ''}
            <p>Récompense: ${task.reward} tokens</p>
            <button class="task-button">Commencer</button>
          </div>
        `).join('')}
      </div>
    ` : '<p class="no-tasks">Aucune tâche disponible</p>';

  } catch (error) {
    content.innerHTML = `
      <div class="error">
        <p>Erreur de chargement</p>
        <button onclick="loadTasks()">Réessayer</button>
      </div>
    `;
  }
}

// ==============================================
// FONCTIONS UTILITAIRES
// ==============================================

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => alert('Lien copié!'))
    .catch(err => console.error('Copy failed:', err));
}

async function loadUserData() {
  try {
    const response = await fetch(`/api/dashboard?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to load user data');
    const data = await response.json();

    balance = data.balance || 0; // <--- ici tu mets à jour la balance globale

    return {
      username: data.username,
      balance: balance, // optionnel car déjà stockée globalement
      lastClaim: data.last_claim,
      mining_speed: data.miningSpeed
    };
  } catch (error) {
    console.error('Error loading user data:', error);
    return { mining_speed: 1 };
  }
}
