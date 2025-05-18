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
  
  userId = tg.initDataUnsafe?.user?.id?.toString(); // Conversion en string explicite
  if (!userId) {
    throw new Error("User ID non trouvé");
  }
  console.log('User ID détecté:', userId);
}

async function loadUserData() {
  try {
    const backendUrl = window.location.origin; // Utilise l'URL actuelle automatiquement
    console.log(`Tentative de chargement depuis: ${backendUrl}/user/${userId}`);
    
    const response = await fetch(`${backendUrl}/user/${userId}`, {
      headers: {
        'Telegram-Data': tg.initData || 'mock-data' // Header requis
      }
    });
    
    console.log("Statut de la réponse:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log("Données utilisateur reçues:", data);
    
    // Affichage protégé
    document.getElementById('username').textContent = data.username || "Anonyme";
    document.getElementById('balance').textContent = data.balance ?? "0";
    document.getElementById('lastClaim').textContent = data.lastClaim ? 
      new Date(data.lastClaim).toLocaleString('fr-FR') : "Jamais";

    return data;
  } catch (error) {
    console.error("Erreur de chargement:", error);
    // Fallback UI
    document.getElementById('balance').textContent = "0";
    document.getElementById('lastClaim').textContent = "Erreur";
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
    </div>
  `;

  const MIN_CLAIM_TIME = 600; // 10 min
  const TOKENS_PER_SECOND = 1/60; // 1 token/min
  const MAX_SESSION_TIME = 3600; // 1h
  
  let tokens = 0;
  let sessionStartTime = Date.now();
  const btn = document.getElementById('main-claim-btn');
  const tokensDisplay = document.getElementById('tokens');
  const deviceId = navigator.userAgent + "-" + userId; // Stable entre les ouvertures

  async function initSession() {
    try {
        const response = await fetch('/start-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, deviceId })
        });
        const data = await response.json();

        if (data.error === "OTHER_DEVICE_ACTIVE") {
            alert("Session active sur un autre appareil !");
            return false;
        }

        if (data.exists) {
            // Reprend le timer existant
            sessionStartTime = new Date().getTime() - (data.elapsedTime * 1000); // <-- Correction ici
            tokens = data.tokens || 0;
        }
        return true;
    } catch (error) {
        console.error("Session error:", error);
        return true;
    }
}

  function updateDisplay() {
    const now = Date.now();
    const elapsed = (now - sessionStartTime) / 1000;
    const remainingTime = Math.max(0, MIN_CLAIM_TIME - elapsed);

    tokens = Math.min(elapsed * TOKENS_PER_SECOND, 60);
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

  async function startMining() {
    const sessionOK = await initSession();
    if (!sessionOK) return;

    const timer = setInterval(() => {
      updateDisplay();
      
      fetch('/update-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tokens, deviceId })
      }).catch(console.error);

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
          deviceId,
          tokens: tokens.toFixed(2),
          username: tg.initDataUnsafe.user?.username || 'Anonyme'
        })
      });
      
      if (!response.ok) throw new Error('Claim failed');
      
      await fetch('/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      sessionStartTime = Date.now();
      tokens = 0;
      updateDisplay();
      await loadUserData();
      
    } catch (error) {
      console.error("Claim error:", error);
      btn.disabled = false;
    }
  });

  startMining();
}

// ==============================================
// INITIALISATION
// ==============================================

// Navigation et structure de base
document.body.innerHTML += `
  <nav class="app-nav">
    <button id="nav-claim" class="nav-button active">Mining</button>
    <button id="nav-tasks" class="nav-button">Tasks</button>
  </nav>
  <div id="content"></div>
`;

// Gestion des clics sur les boutons de navigation
document.getElementById('nav-claim').addEventListener('click', function() {
  showClaim();
  document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
  this.classList.add('active');
});

document.getElementById('nav-tasks').addEventListener('click', function() {
  TasksPage.showTasksPage();
  document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
  this.classList.add('active');
});
// ------------------------------------------------- //

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initTelegramWebApp();
    initParticles();
    await loadUserData();
    showClaim(); // Affiche la page Mining par défaut
  } catch (error) {
    document.body.innerHTML = `
      <div class="error-container">
        <h2>Erreur</h2>
        <p>${error.message}</p>
        <button onclick="location.reload()">Réessayer</button>
      </div>
    `;
  }
});