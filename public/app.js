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
        <span id="claim-text">MINING LOCKED (00:10:00)</span>
      </button>
      <div id="main-claim-result" class="claim-result"></div>
    </div>
  `;

  // Constantes
  const MAX_SESSION_TIME = 3600; // 1h en secondes
  const COOLDOWN_TIME = 600;    // 10min en secondes
  const TOKENS_PER_SECOND = 0.000278; // ~1 token/heure (1/3600)

  let tokens = 0;
  let remainingCooldown = 0;
  let sessionStartTime = 0;
  let miningInterval;
  const btn = document.getElementById('main-claim-btn');
  const tokensDisplay = document.getElementById('tokens');

  // ===== FONCTIONS UTILITAIRES =====
  function saveState() {
    localStorage.setItem('miningState', JSON.stringify({
      tokens,
      sessionStartTime,
      lastUpdate: Date.now()
    }));
  }

  function resetMiningSession() {
    localStorage.removeItem('miningState');
    tokens = 0;
    sessionStartTime = Date.now();
    remainingCooldown = 0;
    updateDisplay();
  }

  function loadState() {
    const saved = localStorage.getItem('miningState');
    if (!saved) return false;

    const state = JSON.parse(saved);
    const now = Date.now();
    const elapsedSinceLastUpdate = Math.floor((now - state.lastUpdate) / 1000);
    const totalElapsed = Math.floor((now - state.sessionStartTime) / 1000);

    // Calcul des tokens (max 1 token/heure)
    tokens = Math.min(
      state.tokens + (elapsedSinceLastUpdate * TOKENS_PER_SECOND),
      MAX_SESSION_TIME * TOKENS_PER_SECOND
    );

    // Gestion du cooldown
    if (totalElapsed >= MAX_SESSION_TIME) {
      const timeSinceSessionEnd = totalElapsed - MAX_SESSION_TIME;
      remainingCooldown = Math.max(0, COOLDOWN_TIME - timeSinceSessionEnd);
    }

    sessionStartTime = state.sessionStartTime;
    return true;
  }

  function updateDisplay() {
    // Affichage des tokens
    tokensDisplay.textContent = tokens.toFixed(4);

    // Calcul du temps à afficher
    const totalElapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    let displayTime;
    
    if (totalElapsed < MAX_SESSION_TIME) {
      displayTime = MAX_SESSION_TIME - totalElapsed; // Temps restant minage
    } else {
      displayTime = remainingCooldown; // Temps restant cooldown
    }

    const minutes = Math.floor(displayTime / 60);
    const seconds = displayTime % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Mise à jour du bouton
    document.getElementById('claim-text').textContent = 
      (remainingCooldown > 0 || totalElapsed < MAX_SESSION_TIME)
        ? `MINING LOCKED (00:${timeStr})` 
        : `CLAIM ${tokens.toFixed(4)} TOKENS`;
  }

  function startMiningSession() {
    // Chargement de l'état existant
    const hasSavedState = loadState();
    
    // Nouvelle session si aucun état sauvegardé
    if (!hasSavedState) {
      sessionStartTime = Date.now();
      saveState();
    }

    // Nettoyage de l'intervalle précédent
    clearInterval(miningInterval);
    
    // Lancement du nouveau timer
    miningInterval = setInterval(() => {
      const now = Date.now();
      const totalElapsed = Math.floor((now - sessionStartTime) / 1000);

      // Pendant la session de minage
      if (totalElapsed < MAX_SESSION_TIME) {
        tokens = Math.min(
          totalElapsed * TOKENS_PER_SECOND,
          MAX_SESSION_TIME * TOKENS_PER_SECOND
        );
        remainingCooldown = 0;
      } 
      // Pendant le cooldown
      else {
        const timeSinceSessionEnd = totalElapsed - MAX_SESSION_TIME;
        remainingCooldown = Math.max(0, COOLDOWN_TIME - timeSinceSessionEnd);
      }

      // Activation/désactivation du bouton
      btn.disabled = (remainingCooldown > 0 || totalElapsed < MAX_SESSION_TIME);
      
      updateDisplay();
      saveState();
    }, 1000);
  }

  // ===== GESTION DU CLAIM =====
  btn.addEventListener('click', async () => {
    const totalElapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    if (totalElapsed < MAX_SESSION_TIME || remainingCooldown > 0) return;
    
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
      if (!response.ok) throw new Error(data.message || 'Erreur');
      
      resetMiningSession();
      startMiningSession();
      await loadUserData();
      
    } catch (error) {
      console.error('Claim error:', error);
      btn.disabled = false;
    }
  });

  // ===== LANCEMENT INITIAL =====
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