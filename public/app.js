// Variables globales
let tg, userId;
let balance = 0;
let miningInterval;
let sessionStartTime = Date.now();
let tokens = 0;
let deviceId; // Changé de const à let pour permettre la modification

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
// GESTION DE SESSION PERSISTANTE
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

function chargerSession() {
  if (typeof localStorage !== 'undefined' && userId) {
    const session = localStorage.getItem('miningSession');
    if (session) {
      const parsed = JSON.parse(session);
      if (parsed.userId === userId && parsed.deviceId === deviceId) {
        const elapsed = (Date.now() - parsed.sessionStartTime) / 1000;
        if (elapsed < 3600) {
          sessionStartTime = parsed.sessionStartTime;
          tokens = parsed.tokens;
          return true;
        }
      }
    }
  }
  return false;
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
  
  userId = tg.initDataUnsafe?.user?.id?.toString();
  if (!userId) {
    throw new Error("User ID non trouvé");
  }
  console.log('User ID détecté:', userId);
  
  // Initialisation de deviceId après avoir userId
  deviceId = navigator.userAgent + "-" + userId;
}

async function demarrerMinage() {
  if (miningInterval) {
    clearInterval(miningInterval);
  }

  const sessionExistante = chargerSession();
  
  if (!sessionExistante) {
    sessionStartTime = Date.now();
    tokens = 0;
    await fetch('/start-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, deviceId })
    }).catch(console.error);
  }

  miningInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - sessionStartTime) / 1000;
    tokens = Math.min(elapsed * (1/60), 60);
    
    updateDisplay();
    sauvegarderSession();
    
    fetch('/update-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, tokens, deviceId })
    }).catch(console.error);
  }, 1000);
}

function updateDisplay() {
  const btn = document.getElementById('main-claim-btn');
  const tokensDisplay = document.getElementById('tokens');
  const claimText = document.getElementById('claim-text');
  
  const now = Date.now();
  const elapsed = (now - sessionStartTime) / 1000;
  const remainingTime = Math.max(0, 600 - elapsed);

  tokensDisplay.textContent = tokens.toFixed(2);

  if (elapsed >= 3600) {
    claimText.textContent = "SESSION EXPIRED";
    btn.disabled = true;
  } 
  else if (elapsed >= 600) {
    claimText.textContent = `CLAIM ${tokens.toFixed(2)} TOKENS`;
    btn.disabled = false;
  } 
  else {
    const mins = Math.floor(remainingTime / 60);
    const secs = Math.floor(remainingTime % 60);
    claimText.textContent = `MINING IN PROGRESS (${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')})`;
    btn.disabled = true;
  }
}

async function handleClaim() {
  const btn = document.getElementById('main-claim-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner-small"></div>';

  try {
    const response = await fetch('/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId,
        deviceId,
        tokens: tokens.toFixed(2),
        username: tg.initDataUnsafe.user?.username || 'Anonyme'
      })
    });

    if (!response.ok) throw new Error('Claim failed');

    localStorage.removeItem('miningSession');
    sessionStartTime = Date.now();
    tokens = 0;
    
    await demarrerMinage();
    await loadUserData();
    
    btn.innerHTML = '<span id="claim-text">MINING IN PROGRESS</span>';

  } catch (error) {
    console.error("Claim error:", error);
    btn.disabled = false;
    btn.innerHTML = '<span id="claim-text">ERREUR - RETRY</span>';
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
    </div>
  `;

  document.getElementById('main-claim-btn').addEventListener('click', handleClaim);
  updateDisplay();
}

// ==============================================
// FONCTIONS EXISTANTES
// ==============================================

async function loadUserData() {
  try {
    const backendUrl = window.location.origin;
    console.log(`Tentative de chargement depuis: ${backendUrl}/user/${userId}`);
    
    const response = await fetch(`${backendUrl}/user/${userId}`, {
      headers: {
        'Telegram-Data': tg.initData || 'mock-data'
      }
    });
    
    console.log("Statut de la réponse:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log("Données utilisateur reçues:", data);
    
    document.getElementById('username').textContent = data.username || "Anonyme";
    document.getElementById('balance').textContent = data.balance ?? "0";
    document.getElementById('lastClaim').textContent = data.lastClaim ? 
      new Date(data.lastClaim).toLocaleString('fr-FR') : "Jamais";

    return data;
  } catch (error) {
    console.error("Erreur de chargement:", error);
    document.getElementById('balance').textContent = "0";
    document.getElementById('lastClaim').textContent = "Erreur";
    throw error;
  }
}

function setupNavigation() {
  const navClaim = document.getElementById('nav-claim');
  const navTasks = document.getElementById('nav-tasks');
  const navReferral = document.getElementById('nav-referral');

  if (!navClaim || !navTasks || !navReferral) {
    console.error("Éléments de navigation manquants");
    return;
  }

  navClaim.addEventListener('click', function() {
    showClaim();
    setActiveButton(this);
  });

  navTasks.addEventListener('click', function() {
    TasksPage.showTasksPage();
    setActiveButton(this);
  });

  navReferral.addEventListener('click', function() {
    setActiveButton(this);
  });
}

function setActiveButton(button) {
  document.querySelectorAll('.nav-button').forEach(btn => {
    btn.classList.remove('active');
  });
  button.classList.add('active');
}

// ==============================================
// INITIALISATION
// ==============================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initTelegramWebApp(); // Initialise userId et deviceId
    initParticles();
    setupNavigation();
    await loadUserData();
    await demarrerMinage();
    showClaim();
  } catch (error) {
    console.error("Erreur d'initialisation:", error);
    document.body.innerHTML = `
      <div class="error-container">
        <h2>Erreur</h2>
        <p>${error.message}</p>
        <button onclick="location.reload()">Réessayer</button>
      </div>
    `;
  }
});