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

  let tokens = 0;
  const maxSessionTime = 600;
  let remainingTime = maxSessionTime;
  const btn = document.getElementById('main-claim-btn');
  const tokensDisplay = document.getElementById('tokens');

  function saveState() {
    localStorage.setItem('miningState', JSON.stringify({
      tokens,
      startTime: Date.now()
    }));
  }

  function resetMiningSession() {
    localStorage.removeItem('miningState');
    tokens = 0;
    remainingTime = maxSessionTime;
    updateDisplay();
  }

  function loadState() {
  const saved = localStorage.getItem('miningState');
  if (saved) {
    const state = JSON.parse(saved);
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    
    // Calcul précis
    tokens = Math.min(elapsed * 0.0167, maxSessionTime * 0.0167); // 1 token/minute max
    remainingTime = Math.max(0, maxSessionTime - elapsed);
    
    // Mise à jour immédiate de l'UI
    updateDisplay();
    btn.disabled = (remainingTime > 0);
    
    return true;
  }
  return false;
}

  function updateDisplay() {
    tokensDisplay.textContent = `${tokens.toFixed(2)} tokens`;
    
    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    document.getElementById('claim-text').textContent = 
      remainingTime > 0 
        ? `MINING LOCKED (00:${timeStr})` 
        : `CLAIM ${tokens.toFixed(2)} TOKENS`;
  }

  function startMiningSession() {
    const hasSavedState = loadState();
    
    if (!hasSavedState) {
      tokens = 0;
      remainingTime = maxSessionTime;
      saveState();
    }

    clearInterval(miningInterval);
    
    miningInterval = setInterval(() => {
      remainingTime = Math.max(0, remainingTime - 1);
      tokens += 0.0167;
      
      if (remainingTime <= 0) {
        btn.disabled = false;
      }

      updateDisplay();
      saveState();
    }, 1000);
  }

  btn.addEventListener('click', async () => {
    if (remainingTime > 0) return;
    
    btn.disabled = true;
    const claimAmount = tokens.toFixed(2);
    
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