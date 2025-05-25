// Variables globales
let tg, userId;
let balance = 0;
let miningInterval;
let sessionStartTime = Date.now();
let tokens = 0;
let deviceId;
let Mining_Speed = 1;

// ==============================================
// SYSTEME DE PARTICULES COSMIQUES
// ==============================================

function createParticles() {
  let container = document.getElementById('particles');
  if (!container) {
    container = document.createElement('div');
    container.id = 'particles';
    container.className = 'particles';
    document.body.appendChild(container);
  }

  const particleCount = window.innerWidth < 768 ? 25 : 40;
  container.innerHTML = '';

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';

    Object.assign(particle.style, {
      width: `${Math.random() * 3 + 1}px`,
      height: '100%',
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      opacity: Math.random() * 0.7 + 0.3,
      animation: `float ${Math.random() * 25 + 15}s linear ${Math.random() * 10}s infinite`
    });

    container.appendChild(particle);
  }
}

function initParticles() {
  createParticles();
  window.addEventListener('resize', createParticles);
}

// ==============================================
// GESTION DE SESSION
// ==============================================

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
  if (typeof localStorage !== 'undefined' && userId) {
    const session = localStorage.getItem('miningSession');
    if (session) {
      const parsed = JSON.parse(session);
      if (parsed.userId === userId && parsed.deviceId === deviceId) {
        sessionStartTime = parsed.sessionStartTime;
        tokens = parsed.tokens;
        return true;
      }
    }
  }
  return false;
}

// ==============================================
// FONCTIONS PRINCIPALES
// ==============================================

async function initTelegramWebApp() {
  window.Telegram.WebApp.ready();

  const user = window.Telegram.WebApp.initDataUnsafe?.user || {};
  Mining_Speed = 1; // peut être calculé dynamiquement ici

  // Met à jour le header
  updateUserInfo({
    username: user.username || "Utilisateur",
    balance: "0"
  });

  // Affiche un contenu basique dans #content pour tokens et bouton claim
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-container">
      <div class="token-display">
        <span id="tokens">0.00</span> tokens
      </div>
      <button id="main-claim-btn" disabled>
        <span id="claim-text">00:00</span>
      </button>
    </div>
  `;

  demarrerMinage();
}

window.addEventListener('DOMContentLoaded', () => {
  initTelegramWebApp();
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
}

function updateUserInfo({ username, balance }) {
  const usernameEl = document.getElementById('username');
  const balanceEl = document.getElementById('balance');
  const speedEl = document.getElementById('mining-speed');

  if (usernameEl && username !== undefined) usernameEl.textContent = username;
  if (balanceEl && balance !== undefined) balanceEl.textContent = balance;
  if (speedEl) speedEl.textContent = `Vitesse de minage : x${Mining_Speed}`;
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

    tokens += (elapsedMs / 60000) * Mining_Speed; // tokens/min converti à ms
    if (tokens > 60 * Mining_Speed) tokens = 60 * Mining_Speed;

    updateDisplay();
    sauvegarderSession();

  }, 1000);
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
    if (result.balance) {
      document.getElementById('balance').textContent = result.balance;
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

  const mins = Math.floor(remainingSeconds / 60);
  const secs = Math.floor(remainingSeconds % 60);
  const timeString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  // Mets à jour tokens (affichage ici, tu peux modifier l’endroit d’affichage)
  // Par exemple, si tu as un élément #tokens dans #content
  const tokensEl = document.getElementById('tokens');
  if (tokensEl) tokensEl.textContent = tokens.toFixed(2);

  // Mets à jour bouton claim
  const claimTextEl = document.getElementById('claim-text');
  if (claimTextEl) claimTextEl.textContent = timeString;

  const btn = document.getElementById('main-claim-btn');
  if (btn) btn.disabled = tokens < 1 || remainingSeconds <= 0;
}

async function demarrerMinage() {
  clearInterval(miningInterval);
  let lastUpdate = Date.now();

  miningInterval = setInterval(() => {
    const now = Date.now();
    const elapsedMs = now - lastUpdate;
    lastUpdate = now;

    // tokens incrémentés par minute, converti ms->min
    tokens += (elapsedMs / 60000) * Mining_Speed;
    if (tokens > 60 * Mining_Speed) tokens = 60 * Mining_Speed; // plafond

    updateDisplay();
  }, 1000);
}


// ==============================================
// FONCTIONS PAGES
// ==============================================

function showClaim() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-container">
      <div class="token-display">
        <span id="tokens">0.00</span>
        <span class="token-unit">tokens</span>
      </div>
      <div id="mining-speed" style="margin-bottom:10px; font-weight:bold; color:#2196F3;">Vitesse de minage: x${Mining_Speed}</div>
      <button id="main-claim-btn" class="mc-button-anim" disabled>
        <span id="claim-text">00:00</span>
        <div class="progress-bar"></div>
      </button>
    </div>
  `;
  document.getElementById('main-claim-btn').addEventListener('click', handleClaim);
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
    const response = await fetch(`/api/user-data?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to load user data');
    return await response.json();
  } catch (error) {
    console.error('Error loading user data:', error);
    return { mining_speed: 1 };
  }
}

// ==============================================
// INITIALISATION
// ==============================================

window.addEventListener('DOMContentLoaded', async () => {
  initTelegramWebApp();
  initParticles();
  initNavigation();
  
  if (userId) {
    try {
      const userData = await loadUserData();
      Mining_Speed = userData.mining_speed || 1;
      updateUserInfo(userData);

      if (!(await chargerSession())) {
        await startNewSession();
      } else {
        await demarrerMinage();
      }
    } catch (error) {
      console.error('Initialization error:', error);
    }
  }

  showClaim();
});
