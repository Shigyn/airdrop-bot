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
        <span id="claim-text">MINING IN PROGRESS (01:00:00)</span>
      </button>
      <div id="main-claim-result" class="claim-result"></div>
    </div>
  `;

  // Constantes
  const MAX_SESSION_TIME = 3600; // 1h = 3600 secondes
  const COOLDOWN_TIME = 600;    // 10min = 600 secondes
  const TOKENS_PER_SECOND = 1 / 3600; // 1 token par heure

  // Variables d'état
  let tokens = 0;
  let sessionStartTime = Date.now();
  let remainingCooldown = 0;
  let miningInterval;
  const btn = document.getElementById('main-claim-btn');
  const tokensDisplay = document.getElementById('tokens');

  // ===== FONCTIONS PRINCIPALES =====
  function saveState() {
    localStorage.setItem('miningState', JSON.stringify({
      tokens,
      sessionStartTime,
      lastUpdate: Date.now(),
      remainingCooldown
    }));
  }

  function resetMiningSession() {
    tokens = 0;
    sessionStartTime = Date.now();
    remainingCooldown = 0;
    saveState();
    updateDisplay();
  }

  function loadState() {
    const saved = localStorage.getItem('miningState');
    if (!saved) return false;

    try {
      const state = JSON.parse(saved);
      const now = Date.now();
      const elapsedSinceLastUpdate = (now - state.lastUpdate) / 1000;

      // Calcul des tokens accumulés
      const activeMiningTime = Math.min(
        (state.sessionStartTime > 0 ? (now - state.sessionStartTime) / 1000 : 0),
        MAX_SESSION_TIME
      );
      
      tokens = Math.min(
        parseFloat(state.tokens || 0) + (activeMiningTime * TOKENS_PER_SECOND),
        MAX_SESSION_TIME * TOKENS_PER_SECOND
      );

      // Calcul du cooldown restant
      if (activeMiningTime >= MAX_SESSION_TIME) {
        const cooldownElapsed = Math.max(0, (now - (state.sessionStartTime + MAX_SESSION_TIME * 1000)) / 1000;
        remainingCooldown = Math.max(0, COOLDOWN_TIME - cooldownElapsed);
      }

      sessionStartTime = state.sessionStartTime || now;
      return true;

    } catch (e) {
      console.error("Error loading state:", e);
      return false;
    }
  }

  function updateDisplay() {
    // Formatage des tokens
    const displayTokens = isNaN(tokens) ? 0 : tokens;
    tokensDisplay.textContent = displayTokens.toFixed(4);

    // Calcul du temps à afficher
    const now = Date.now();
    const sessionElapsed = (now - sessionStartTime) / 1000;
    let displayTime, displayText;

    if (sessionElapsed < MAX_SESSION_TIME) {
      // Mode minage en cours
      displayTime = MAX_SESSION_TIME - sessionElapsed;
      displayText = `MINING IN PROGRESS (${formatTime(displayTime)})`;
    } else if (remainingCooldown > 0) {
      // Mode cooldown
      displayTime = remainingCooldown;
      displayText = `MINING LOCKED (${formatTime(displayTime)})`;
    } else {
      // Prêt à claim
      displayText = `CLAIM ${displayTokens.toFixed(4)} TOKENS`;
    }

    // Mise à jour de l'UI
    document.getElementById('claim-text').textContent = displayText;
    btn.disabled = (sessionElapsed < MAX_SESSION_TIME || remainingCooldown > 0);
  }

  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  }

  function startMiningSession() {
    // Initialisation
    if (!loadState()) {
      resetMiningSession();
    }

    // Nettoyage de l'ancien intervalle
    clearInterval(miningInterval);

    // Nouvel intervalle
    miningInterval = setInterval(() => {
      const now = Date.now();
      const sessionElapsed = (now - sessionStartTime) / 1000;

      if (sessionElapsed < MAX_SESSION_TIME) {
        // Phase de minage active
        tokens = Math.min(
          sessionElapsed * TOKENS_PER_SECOND,
          MAX_SESSION_TIME * TOKENS_PER_SECOND
        );
        remainingCooldown = 0;
      } else {
        // Phase de cooldown
        const cooldownElapsed = (now - (sessionStartTime + MAX_SESSION_TIME * 1000)) / 1000;
        remainingCooldown = Math.max(0, COOLDOWN_TIME - cooldownElapsed);
      }

      updateDisplay();
      saveState();
    }, 1000);
  }

  // ===== GESTION DU CLAIM =====
  btn.addEventListener('click', async () => {
    const sessionElapsed = (Date.now() - sessionStartTime) / 1000;
    if (sessionElapsed < MAX_SESSION_TIME || remainingCooldown > 0) return;

    btn.disabled = true;
    const claimAmount = tokens.toFixed(4);

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
      console.error('Claim failed:', error);
      btn.disabled = false;
    }
  });

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