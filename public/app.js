// Variables globales
let tg, userId;
let balance = 0;
let miningInterval;

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
  
  window.addEventListener('resize', () => {
    if (window.innerWidth < 768 && document.querySelectorAll('.particle').length > 25) {
      createParticles();
    } else if (window.innerWidth >= 768 && document.querySelectorAll('.particle').length <= 25) {
      createParticles();
    }
  });
}

// ==============================================
// FONCTIONS PRINCIPALES
// ==============================================

function initTelegramWebApp() {
  console.log('Initialisation de Telegram WebApp...');
  
  if (!window.Telegram?.WebApp) {
    throw new Error("Ouvrez via l'application Telegram");
  }

  tg = window.Telegram.WebApp;
  tg.expand();
  
  userId = tg.initDataUnsafe?.user?.id;
  if (!userId) {
    throw new Error("User ID non trouvé");
  }
}

async function loadUserData() {
  try {
    const response = await fetch(`/user/${userId}`);
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error || 'Erreur serveur');
    
    document.getElementById('username').textContent = data.username || "Anonyme";
    document.getElementById('balance').textContent = data.balance ?? "0";
    document.getElementById('lastClaim').textContent = 
      data.lastClaim ? new Date(data.lastClaim).toLocaleString('fr-FR') : "Jamais";

    balance = parseFloat(data.balance) || 0;
    return data;
  } catch (error) {
    console.error("Erreur:", error);
    throw error;
  }
}

function showClaim() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-container">
      <div class="token-display">
        <span id="tokens">0.00</span>
        <span class="token-unit">tokens</span>
      </div>
      <button id="main-claim-btn" class="claim-button" disabled>
        <span id="claim-text">MINING IN PROGRESS (00:10:00)</span>
      </button>
      <button id="restart-btn" class="claim-button" style="display:none; margin-top:10px;">
        <span id="restart-text">RESTART MINING</span>
      </button>
      <div id="main-claim-result" class="claim-result"></div>
    </div>
  `;

  // Constantes (1 token/minute)
  const MIN_CLAIM_TIME = 600;     // 10min
  const MAX_SESSION_TIME = 3600;  // 1h
  const TOKENS_PER_SECOND = 1/60; // 1 token/minute

  // Variables avec valeurs par défaut sécurisées
  let tokens = 0;
  let sessionStartTime = Date.now();
  let miningInterval;
  const btn = document.getElementById('main-claim-btn');
  const restartBtn = document.getElementById('restart-btn');
  const tokensDisplay = document.getElementById('tokens');

  // ===== FONCTIONS PROTÉGÉES =====
  function safeParseFloat(value) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  function formatTime(seconds) {
    const secs = Math.max(0, Math.floor(safeParseFloat(seconds)));
    const mins = Math.floor(secs / 60);
    return `${mins.toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
  }

  function saveState() {
    localStorage.setItem('miningState', JSON.stringify({
      tokens: safeParseFloat(tokens),
      sessionStartTime,
      lastUpdate: Date.now()
    }));
  }

  function resetMiningSession() {
    tokens = 0;
    sessionStartTime = Date.now();
    saveState();
    updateDisplay();
    startMiningSession();
  }

  function loadState() {
    try {
      const saved = localStorage.getItem('miningState');
      if (!saved) return false;

      const state = JSON.parse(saved);
      const now = Date.now();
      const elapsed = (now - state.sessionStartTime) / 1000;

      if (elapsed > MAX_SESSION_TIME) return false;

      tokens = Math.min(
        safeParseFloat(state.tokens) + (elapsed * TOKENS_PER_SECOND),
        MAX_SESSION_TIME * TOKENS_PER_SECOND
      );
      sessionStartTime = state.sessionStartTime;
      return true;
    } catch (e) {
      console.error("Load error:", e);
      return false;
    }
  }

  function updateDisplay() {
    // Protection des valeurs
    const now = Date.now();
    const elapsed = Math.max(0, (now - sessionStartTime) / 1000);
    const remainingTime = Math.max(0, MIN_CLAIM_TIME - elapsed);
    
    // Mise à jour des tokens
    tokensDisplay.textContent = safeParseFloat(tokens).toFixed(2);

    // Gestion du bouton principal
    if (elapsed >= MAX_SESSION_TIME) {
      document.getElementById('claim-text').textContent = "SESSION EXPIRED";
      btn.disabled = true;
      restartBtn.style.display = 'block';
    } else if (elapsed >= MIN_CLAIM_TIME) {
      document.getElementById('claim-text').textContent = `CLAIM ${safeParseFloat(tokens).toFixed(2)} TOKENS`;
      btn.disabled = false;
      restartBtn.style.display = 'none';
    } else {
      document.getElementById('claim-text').textContent = `MINING IN PROGRESS (${formatTime(remainingTime)})`;
      btn.disabled = true;
      restartBtn.style.display = 'none';
    }
  }

  function startMiningSession() {
    if (!loadState()) {
      resetMiningSession();
      return;
    }

    clearInterval(miningInterval);
    
    miningInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - sessionStartTime) / 1000;

      tokens = Math.min(
        elapsed * TOKENS_PER_SECOND,
        MAX_SESSION_TIME * TOKENS_PER_SECOND
      );

      updateDisplay();
      saveState();

      if (elapsed >= MAX_SESSION_TIME) {
        clearInterval(miningInterval);
      }
    }, 1000);
  }

  // ===== GESTION DES ÉVÉNEMENTS =====
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const claimAmount = safeParseFloat(tokens).toFixed(2);

    try {
      const response = await fetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          tokens: claimAmount,
          username: tg.initDataUnsafe.user?.username || 'Anonyme'
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Claim error');

      resetMiningSession();
      await loadUserData();
      
    } catch (error) {
      console.error('Claim error:', error);
      btn.disabled = false;
    }
  });

  restartBtn.addEventListener('click', resetMiningSession);

  // ===== LANCEMENT =====
  startMiningSession();
}

// ==============================================
// INITIALISATION
// ==============================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initTelegramWebApp();
    initParticles();
    await loadUserData();
    showClaim();
  } catch (error) {
    document.body.innerHTML = `
      <div class="error-container">
        <h2>Erreur</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
});