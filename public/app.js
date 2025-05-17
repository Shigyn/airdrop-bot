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
      <div id="main-claim-result" class="claim-result"></div>
    </div>
  `;

  // Configuration (1 token/minute)
  const MIN_CLAIM_TIME = 600;     // 10 minutes
  const MAX_SESSION_TIME = 3600;  // 1 heure
  const TOKENS_PER_SECOND = 1/60; // 1 token/minute

  // État initial
  let tokens = 0;
  let sessionStartTime = Date.now();
  let miningInterval;
  const btn = document.getElementById('main-claim-btn');
  const tokensDisplay = document.getElementById('tokens');

  // Sauvegarde l'état actuel
  function saveState() {
    localStorage.setItem('miningState', JSON.stringify({
      tokens,
      sessionStartTime,
      lastUpdate: Date.now()
    }));
  }

  // Charge l'état sauvegardé
  function loadState() {
    const saved = localStorage.getItem('miningState');
    if (!saved) return false;

    try {
      const state = JSON.parse(saved);
      const now = Date.now();
      const elapsed = (now - state.sessionStartTime) / 1000;

      // Si session expirée, on ignore
      if (elapsed > MAX_SESSION_TIME) return false;

      tokens = Math.min(elapsed * TOKENS_PER_SECOND, MAX_SESSION_TIME * TOKENS_PER_SECOND);
      sessionStartTime = state.sessionStartTime;
      return true;
    } catch (e) {
      console.error("Erreur de chargement:", e);
      return false;
    }
  }

  function updateDisplay() {
    const now = Date.now();
    const elapsed = (now - sessionStartTime) / 1000;
    const remainingTime = Math.max(0, MIN_CLAIM_TIME - elapsed);

    tokens = Math.min(elapsed * TOKENS_PER_SECOND, MAX_SESSION_TIME * TOKENS_PER_SECOND);
    tokensDisplay.textContent = tokens.toFixed(2);

    if (elapsed >= MAX_SESSION_TIME) {
      document.getElementById('claim-text').textContent = "SESSION EXPIRED";
      btn.disabled = true;
    } 
    else if (elapsed >= MIN_CLAIM_TIME) {
      document.getElementById('claim-text').textContent = `CLAIM ${tokens.toFixed(2)} TOKENS`;
      btn.disabled = false;
    } 
    else {
      const mins = Math.floor(remainingTime / 60);
      const secs = Math.floor(remainingTime % 60);
      document.getElementById('claim-text').textContent = 
        `MINING IN PROGRESS (${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')})`;
      btn.disabled = true;
    }
  }

  function startMining() {
    // Charge l'état existant ou initialise
    if (!loadState()) {
      sessionStartTime = Date.now();
      tokens = 0;
    }

    clearInterval(miningInterval);
    
    miningInterval = setInterval(() => {
      updateDisplay();
      saveState();
      
      if ((Date.now() - sessionStartTime) / 1000 >= MAX_SESSION_TIME) {
        clearInterval(miningInterval);
      }
    }, 1000);
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const response = await fetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          tokens: tokens.toFixed(2),
          username: tg.initDataUnsafe.user?.username || 'Anonyme'
        })
      });
      
      if (!response.ok) throw new Error('Claim failed');
      
      // Nouvelle session après claim
      sessionStartTime = Date.now();
      tokens = 0;
      saveState();
      updateDisplay();
      await loadUserData();
    } catch (error) {
      console.error(error);
      btn.disabled = false;
    }
  });

  // DÉMARRAGE
  startMining();
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