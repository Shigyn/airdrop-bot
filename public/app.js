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

function initTelegramWebApp() {
  if (!window.Telegram?.WebApp) {
    tg = {
      WebApp: {
        initDataUnsafe: { 
          user: { 
            id: "test_user", 
            username: "TestUser"
          } 
        }
      }
    };
    userId = "test_user";
    deviceId = "test_device_id";
    updateUserInfo({ username: "TestUser", balance: "100" });
    return;
  }

  tg = window.Telegram.WebApp;
  tg.expand();

  const user = tg.initDataUnsafe?.user;
  userId = user?.id?.toString() || "user_" + Math.random().toString(36).substr(2, 9);
  deviceId = `${navigator.userAgent}-${userId}`.replace(/\s+/g, '_');

  updateUserInfo({
    username: user?.username || "Utilisateur",
    balance: "0"
  });
}

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

function updateUserInfo(data) {
  // Affiche username et balance, créer l'élément username si besoin
  let usernameEl = document.getElementById('username');
  if (!usernameEl) {
    usernameEl = document.createElement('div');
    usernameEl.id = 'username';
    usernameEl.style.fontWeight = 'bold';
    usernameEl.style.marginBottom = '8px';
    const container = document.getElementById('user-info') || document.body;
    container.prepend(usernameEl);
  }
  usernameEl.textContent = data.username || "Utilisateur";

  const balanceEl = document.getElementById('balance');
  if (balanceEl) balanceEl.textContent = `${data.balance || 0} tokens`;

  balance = Number(data.balance) || 0;
}

// ==============================================
// FONCTIONS MINAGE
// ==============================================

async function demarrerMinage() {
  clearInterval(miningInterval);
  
  try {
    const userData = await loadUserData();
    Mining_Speed = userData.mining_speed || 1;
    
    miningInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = (now - sessionStartTime) / 1000;
      const elapsedMinutes = elapsedSeconds / 60;
      
      // Calcul tokens minés, max 60 tokens * Mining_Speed (1 token/min max)
      tokens = Math.min(Math.floor(elapsedMinutes) * Mining_Speed, 60 * Mining_Speed);
      
      updateDisplay();
      sauvegarderSession();
      
      // Synchronisation toutes les 30 secondes
      if (Math.floor(elapsedSeconds) % 30 === 0) {
        fetch('/update-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, tokens, deviceId })
        }).catch(console.error);
      }
    }, 1000);
    
  } catch (error) {
    console.error('Erreur démarrage minage:', error);
  }
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
    const tokensToClaim = Math.floor(elapsedMinutes * Mining_Speed);

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
    
    // Reset après claim
    tokens = 0;
    sessionStartTime = Date.now();
    
    // Mise à jour balance UI
    if (result.balance) {
      document.getElementById('balance').textContent = `${result.balance} tokens`;
      balance = Number(result.balance);
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
  const remainingSeconds = Math.max(0, 3600 - elapsedSeconds); // 60 minutes
  
  // Format MM:SS
  const mins = Math.floor(remainingSeconds / 60);
  const secs = Math.floor(remainingSeconds % 60);
  const timeString = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  
  // Update UI
  const tokensEl = document.getElementById('tokens');
  if (tokensEl) tokensEl.textContent = tokens.toFixed(2);
  const claimText = document.getElementById('claim-text');
  if (claimText) claimText.textContent = timeString;
  
  const progressBar = document.querySelector('.progress-bar');
  if (progressBar) {
    const progressPercent = (elapsedSeconds / 3600) * 100;
    progressBar.style.width = `${Math.min(100, progressPercent)}%`;
  }
  
  const claimBtn = document.getElementById('main-claim-btn');
  if (claimBtn) claimBtn.disabled = tokens < 1 || remainingSeconds <= 0;
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

function showErrorState() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="error">
      <p>Une erreur est survenue, veuillez réessayer.</p>
      <button onclick="startNewSession()">Réessayer</button>
    </div>
  `;
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
      updateUserInfo(userData);
      Mining_Speed = userData.mining_speed || 1;
      
      if (!(await chargerSession())) {
        await startNewSession();
      } else {
        await demarrerMinage();
      }
    } catch (error) {
      console.error('Initialization error:', error);
      showErrorState();
    }
  }

  showClaim();
});
