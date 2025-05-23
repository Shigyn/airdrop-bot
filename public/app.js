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
  
  Telegram.WebApp.backgroundColor = "#6B6B6B"; // Gris Minecraft
  Telegram.WebApp.headerColor = "#6B6B6B";     // Optionnel
  
  userId = tg.initDataUnsafe?.user?.id?.toString();
  if (!userId) {
    throw new Error("User ID non trouvé");
  }
  console.log('User ID détecté:', userId);
  
  // Remplacer la ligne deviceId existante par :
deviceId = `${navigator.userAgent}-${userId}`.replace(/\s+/g, '_');
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

    updateDisplay();  // Met à jour texte + barre

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
  const progressBar = btn.querySelector('.progress-bar');

  const now = Date.now();
  const elapsed = (now - sessionStartTime) / 1000;
  const remainingTime = Math.max(0, 600 - elapsed);

  tokensDisplay.textContent = tokens.toFixed(2);

  if (elapsed >= 3600) {
    claimText.textContent = "SESSION EXPIRED";
    btn.disabled = true;
    progressBar.style.width = '100%';
  } else if (elapsed >= 600) {
    claimText.textContent = `CLAIM ${tokens.toFixed(2)} TOKENS`;
    btn.disabled = false;
    progressBar.style.width = '100%';
  } else {
    const percent = (elapsed / 600) * 100;
    progressBar.style.width = `${percent}%`;
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
    // 1. Synchronisation de session avant le claim
    const syncResponse = await fetch('/sync-session', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Telegram-Data': window.Telegram.WebApp.initData || ''
      },
      body: JSON.stringify({ 
        userId,
        deviceId: `${navigator.userAgent}-${userId}`.replace(/\s+/g, '_')
      })
    });

    const syncData = await syncResponse.json();
    if (syncData.status === 'DEVICE_MISMATCH') {
      throw new Error("Session expired. Please restart the app.");
    }

    // 2. Envoi de la requête de claim
    const claimResponse = await fetch('/claim', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Telegram-Data': window.Telegram.WebApp.initData || ''
      },
      body: JSON.stringify({ 
        userId,
        deviceId: `${navigator.userAgent}-${userId}`.replace(/\s+/g, '_'),
        tokens: tokens.toFixed(2),
        username: tg.initDataUnsafe.user?.username || 'Anonyme',
        userAgent: navigator.userAgent
      })
    });

    const claimData = await claimResponse.json();
    
    if (!claimResponse.ok) {
      throw new Error(claimData.message || claimData.error || 'Claim failed');
    }

    // 3. Réinitialisation après succès
    localStorage.removeItem('miningSession');
    sessionStartTime = Date.now();
    tokens = 0;
    
    // 4. Redémarrage du minage
    await demarrerMinage();
    await loadUserData();
    
    // 5. Mise à jour de l'UI
    btn.innerHTML = '<span id="claim-text">MINING IN PROGRESS</span>';
    updateDisplay();

    // 6. Notification de succès
    if (window.Telegram?.WebApp?.showAlert) {
      window.Telegram.WebApp.showAlert(`Successfully claimed ${claimData.claimed} tokens!`);
    }

  } catch (error) {
    console.error("Full claim error:", {
      error: error.message,
      userId,
      deviceId,
      time: new Date().toISOString()
    });
    
    // Gestion d'erreur améliorée
    let errorMessage = error.message;
    if (errorMessage.includes('device mismatch')) {
      errorMessage = "Session expired. Please restart the mining.";
    } else if (errorMessage.includes('invalid session')) {
      errorMessage = "Invalid session. Refresh the page.";
    }

    btn.disabled = false;
    btn.innerHTML = `<span id="claim-text">ERREUR - ${errorMessage || 'RETRY'}</span>`;
    
    // Réessai automatique après 5 secondes
    setTimeout(() => {
      btn.innerHTML = '<span id="claim-text">TRY AGAIN</span>';
    }, 5000);
  }
}

function showClaim() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-container" style="text-align:center;">
      <div class="token-display" style="margin-bottom: 12px;">
        <span id="tokens" style="font-size: 2rem; font-weight: bold;">0.00</span>
        <span class="token-unit" style="font-size: 1rem;">tokens</span>
      </div>
      <button id="main-claim-btn" class="mc-button-anim" disabled style="position: relative; overflow: hidden; width: 250px; height: 50px; font-size: 1.2rem; cursor: pointer; border-radius: 8px; border: none; background-color: #4caf50; color: white;">
        <span id="claim-text" style="position: relative; z-index: 2;">MINING IN PROGRESS</span>
        <div class="progress-bar" style="
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0%;
          background: rgba(255, 255, 255, 0.3);
          z-index: 1;
          transition: width 1s linear;
        "></div>
      </button>
    </div>
  `;

  const btn = document.getElementById('main-claim-btn');
  btn.addEventListener('click', handleClaim);
  updateDisplay();
}

function startMiningButton(button, durationSeconds) {
  const progressBar = button.querySelector('::before'); // pseudo-element, pas accessible en JS, donc on anime via style.width sur un enfant ou via animation CSS
  const countdown = button.querySelector('.countdown');
  
  let startTime = Date.now();
  let endTime = startTime + durationSeconds * 1000;

  // Au lieu d'animer ::before (impossible en JS), on crée une div progress inside the button:
  let progress = button.querySelector('.progress-bar');
  if (!progress) {
    progress = document.createElement('div');
    progress.classList.add('progress-bar');
    progress.style.position = 'absolute';
    progress.style.left = 0;
    progress.style.top = 0;
    progress.style.bottom = 0;
    progress.style.width = '0%';
    progress.style.background = 'rgba(255, 255, 255, 0.3)';
    progress.style.zIndex = '0';
    button.prepend(progress);
  }

  function update() {
    const now = Date.now();
    const elapsed = now - startTime;
    const percent = Math.min(elapsed / (durationSeconds * 1000), 1);
    progress.style.width = (percent * 100) + '%';

    const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
    countdown.textContent = remaining + "s";

    if (percent < 1) {
      requestAnimationFrame(update);
    } else {
      countdown.textContent = "Done";
    }
  }

  update();
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

  navClaim.addEventListener('click', function() {
    showClaim();
    setActiveButton(this);
  });

  navTasks.addEventListener('click', function() {
    TasksPage.showTasksPage();
    setActiveButton(this);
  });

  navReferral.addEventListener('click', function() {
    ReferralPage.showReferralPage();
    setActiveButton(this);
  });

  function setActiveButton(button) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    button.classList.add('active');
  }
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