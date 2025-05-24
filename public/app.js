// Variables globales
let tg, userId;
let balance = 0;
let miningInterval;
let sessionStartTime = Date.now();
let tokens = 0;
let deviceId; // let pour pouvoir modifier
let Mining_Speed = 1; // variable globale par défaut

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
    const particleCount = document.querySelectorAll('.particle').length;
    if (window.innerWidth < 768 && particleCount !== 25) {
      createParticles();
    } else if (window.innerWidth >= 768 && particleCount !== 40) {
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
      deviceId,
      lastSave: Date.now() // timestamp sauvegarde
    }));
  }
}

async function chargerSession() {
  if (typeof localStorage !== 'undefined' && userId) {
    const session = localStorage.getItem('miningSession');
    if (session) {
      const parsed = JSON.parse(session);

      if (parsed.userId === userId && parsed.deviceId === deviceId) {
        try {
          const verification = await fetch('/api/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              deviceId,
              sessionStartTime: parsed.sessionStartTime
            })
          });

          if (verification.ok) {
            const data = await verification.json();

            if (data.valid) {
              const now = Date.now();
              const elapsedSeconds = (now - parsed.sessionStartTime) / 1000;
              if (elapsedSeconds <= 3600) { // max 60 min
                sessionStartTime = parsed.sessionStartTime;
                tokens = Math.min(parsed.tokens, 60 * Mining_Speed);
                return true;
              }
            }
          }
        } catch (error) {
          console.error('Session verification error:', error);
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
  console.log("Initialisation de Telegram WebApp...");

  if (!window.Telegram?.WebApp) {
    console.error("WebApp Telegram non détecté - Mode test activé");
    tg = {
      WebApp: {
        initDataUnsafe: { user: { id: "test_user", username: "TestUser" } },
        expand: () => console.log("Fonction expand appelée"),
        initData: "mock_data"
      }
    };
    userId = "test_user_id";
    deviceId = "test_device_id";
    return;
  }

  tg = window.Telegram.WebApp;
  tg.expand();

  Telegram.WebApp.backgroundColor = "#6B6B6B";
  Telegram.WebApp.headerColor = "#6B6B6B";

  userId = tg.initDataUnsafe?.user?.id?.toString();
  if (!userId) {
    console.warn("User ID non trouvé - Utilisation d'un ID par défaut");
    userId = "default_user_" + Math.random().toString(36).substr(2, 9);
  }

  deviceId = `${navigator.userAgent}-${userId}`.replace(/\s+/g, '_');
  console.log("Init réussie - UserID:", userId, "DeviceID:", deviceId);
}

async function loadUserData() {
  try {
    const response = await fetch('/api/user-data', {
      headers: {
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      }
    });
    
    if (!response.ok) throw new Error('Failed to load user data');
    
    return await response.json();
  } catch (error) {
    console.error('Error loading user data:', error);
    return { mining_speed: 1 }; // Valeur par défaut
  }
}

async function loadDashboard() {
  const dashboardElement = document.getElementById('dashboard-content');
  
  try {
    // Afficher le loader
    dashboardElement.innerHTML = '<div class="loader">Chargement...</div>';
    
    // 1. Charger les données utilisateur
    const userData = await fetch('/api/user-data', {
      headers: {
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      }
    });
    
    if (!userData.ok) throw new Error('Failed to load user data');
    
    // 2. Charger les données du dashboard
    const dashboardData = await fetch('/api/dashboard', {
      headers: {
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      }
    });
    
    if (!dashboardData.ok) throw new Error('Failed to load dashboard');
    
    // 3. Afficher les données
    const data = await dashboardData.json();
    dashboardElement.innerHTML = `
      <div class="balance-card">
        <h3>Votre solde</h3>
        <p>${data.balance} tokens</p>
      </div>
      <!-- Autres éléments du dashboard -->
    `;
    
  } catch (error) {
    dashboardElement.innerHTML = `
      <div class="error">
        Erreur de chargement: ${error.message}
        <button onclick="loadDashboard()">Réessayer</button>
      </div>
    `;
    console.error('Dashboard load error:', error);
  }
}

async function loadReferrals() {
  try {
    const response = await fetch('/api/referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      },
      body: JSON.stringify({ userId })
    });
    
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    
    document.getElementById('referrals-content').innerHTML = `
      <div class="referral-card">
        <h3>Votre code: ${data.referralCode}</h3>
        <p>${data.referredUsers.length} parrainages</p>
      </div>
    `;
    
  } catch (error) {
    console.error('Referrals load error:', error);
    // Afficher un message d'erreur
  }
}

async function loadTasks() {
  try {
    const response = await fetch('/api/tasks', {
      headers: {
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      }
    });
    
    const tasks = await response.json();
    
    let tasksHTML = '';
    tasks.forEach(task => {
      tasksHTML += `
        <div class="task-item">
          <h4>${task.title}</h4>
          <p>Récompense: ${task.reward} tokens</p>
          <button onclick="startTask('${task.id}')">Commencer</button>
        </div>
      `;
    });
    
    document.getElementById('tasks-content').innerHTML = tasksHTML || '<p>Aucune tâche disponible</p>';
    
  } catch (error) {
    console.error('Tasks load error:', error);
  }
}

// Dans app.js - Ajoutez ce gestionnaire de navigation
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  
  navButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const target = e.currentTarget.dataset.target;
      showPage(target);
    });
  });
}

function showPage(pageId) {
  // Masquer toutes les pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.add('hidden');
  });

  // Afficher la page cible
  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.remove('hidden');
    
    // Charger le contenu spécifique
    switch(pageId) {
      case 'dashboard-page':
        loadDashboard();
        break;
      case 'tasks-page':
        loadTasks();
        break;
      case 'referrals-page':
        loadReferrals();
        break;
    }
  }
}

async function demarrerMinage() {
  // Arrêter tout intervalle existant
  if (miningInterval) {
    clearInterval(miningInterval);
    miningInterval = null;
  }

  try {
    // 1. Charger les données utilisateur d'abord
    const userData = await loadUserData();
    Mining_Speed = userData.mining_speed || 1;
    
    // 2. Vérifier l'état de la session
    const sessionCheck = await fetch('/api/verify-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      },
      body: JSON.stringify({ userId, deviceId })
    });

    if (!sessionCheck.ok) {
      throw new Error('SESSION_CHECK_FAILED');
    }

    const sessionData = await sessionCheck.json();
    
    // 3. Gérer selon l'état de la session
    switch (sessionData.status) {
      case 'SESSION_VALID':
        // Reprendre session existante
        sessionStartTime = new Date(sessionData.startTime).getTime();
        tokens = parseFloat(sessionData.tokens) || 0;
        break;
        
      case 'DEVICE_MISMATCH':
        // Nouvel appareil - nouvelle session
        console.warn('Appareil différent détecté, démarrage nouvelle session');
        await startNewSession();
        return;
        
      case 'NO_SESSION':
      default:
        // Démarrer nouvelle session
        await startNewSession();
        return;
    }

    // 4. Démarrer le minage
    miningInterval = setInterval(async () => {
      try {
        const now = Date.now();
        const elapsedSeconds = (now - sessionStartTime) / 1000;
        const maxTokens = 60 * Mining_Speed; // 60 minutes * vitesse
        
        // Calculer les tokens (max 1 token/min)
        tokens = Math.min(elapsedSeconds * (Mining_Speed / 60), maxTokens);
        
        // Mettre à jour l'affichage
        updateDisplay();
        
        // Sauvegarder localement
        sauvegarderSession();
        
        // Synchroniser avec le serveur
        const syncResponse = await fetch('/update-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            tokens: tokens.toFixed(4), 
            deviceId 
          })
        });
        
        if (!syncResponse.ok) {
          console.error('Échec synchronisation session');
        }
      } catch (error) {
        console.error('Erreur intervalle minage:', error);
      }
    }, 1000); // Mise à jour chaque seconde

  } catch (error) {
    console.error('Erreur démarrage minage:', error);
    
    // Fallback - démarrer nouvelle session en cas d'erreur
    try {
      await startNewSession();
    } catch (fallbackError) {
      console.error('Échec démarrage session de secours:', fallbackError);
      showErrorState();
    }
  }
}

// Fonction pour afficher l'état d'erreur
function showErrorState() {
  const content = document.getElementById('content');
  if (!content) return;
  
  content.innerHTML = `
    <div class="error-state" style="text-align: center; padding: 20px;">
      <h3 style="color: #ff4444;">Erreur de connexion</h3>
      <p>Impossible de se connecter au serveur</p>
      <button onclick="window.location.reload()" 
              style="padding: 10px 20px; background: #ff4444; color: white; border: none; border-radius: 5px;">
        Réessayer
      </button>
    </div>
  `;
}

async function startNewSession() {
  sessionStartTime = Date.now();
  tokens = 0;

  const response = await fetch('/start-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, deviceId })
  });

  if (!response.ok) {
    throw new Error('Failed to start new session');
  }

  demarrerMinage();
}

async function handleClaim() {
  const btn = document.getElementById('main-claim-btn');
  if (!btn) return;

  const originalHTML = btn.innerHTML;
  const originalDisabled = btn.disabled;

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-mini"></div>';

  try {
    const sessionCheck = await fetch('/api/verify-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      },
      body: JSON.stringify({ userId, deviceId })
    });

    if (!sessionCheck.ok) {
      const errorData = await sessionCheck.json();
      throw new Error(errorData.error || 'SESSION_VERIFICATION_FAILED');
    }

    const claimResponse = await fetch('/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      },
      body: JSON.stringify({
        userId,
        tokens: tokens.toFixed(2),
        username: window.Telegram?.WebApp?.initDataUnsafe?.user?.username || 'Anonyme',
        deviceId
      })
    });

    if (!claimResponse.ok) {
      const errorData = await claimResponse.json();
      throw new Error(errorData.error || 'CLAIM_FAILED');
    }

    const result = await claimResponse.json();

    tokens = 0;
    sessionStartTime = Date.now();
    Mining_Speed = result.m || 1;

    btn.innerHTML = '<span style="color:#4CAF50">✓ Réussi</span>';
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = originalDisabled;
      updateDisplay();
    }, 1500);

    if (result.b) {
      document.getElementById('balance').textContent = result.b;
    }
  } catch (error) {
    console.error('Claim Error:', error);

    const ERROR_MESSAGES = {
      'NO_USER_DATA': 'Non connecté',
      'SESSION_VERIFICATION_FAILED': 'Session invalide',
      'DEVICE_MISMATCH': 'Appareil invalide',
      'CLAIM_FAILED': 'Erreur serveur',
      'NETWORK_ERROR': 'Problème réseau',
      'LIMIT_REACHED': 'Limite atteinte'
    };

    const errorMsg = ERROR_MESSAGES[error.message] || 'Erreur';

    btn.innerHTML = `
      <span style="
        display: inline-block;
        max-width: 80px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.8rem;
        color: #FF5252;
      ">
        ⚠️ ${errorMsg}
      </span>
    `;

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = originalDisabled;
      updateDisplay();

      if (error.message === 'SESSION_VERIFICATION_FAILED' || error.message === 'DEVICE_MISMATCH') {
        startNewSession();
      }
    }, 3000);
  }
}

function updateDisplay() {
  const btn = document.getElementById('main-claim-btn');
  const tokensDisplay = document.getElementById('tokens');
  const claimText = document.getElementById('claim-text');
  const progressBar = btn.querySelector('.progress-bar');

  const now = Date.now();
  const elapsed = (now - sessionStartTime) / 1000;
  const sessionDuration = 3600; // 60 minutes

  if (elapsed >= sessionDuration) {
    sessionStartTime = Date.now();
    tokens = 0;
  }

  const elapsedAfterReset = (now - sessionStartTime) / 1000;
  const remainingTime = Math.max(0, sessionDuration - elapsedAfterReset);

  tokensDisplay.textContent = tokens.toFixed(2);

  const percent = (elapsedAfterReset / sessionDuration) * 100;
  progressBar.style.width = `${percent}%`;

  const mins = Math.floor(remainingTime / 60);
  const secs = Math.floor(remainingTime % 60);

  claimText.style.whiteSpace = 'nowrap';
  claimText.style.fontSize = '1rem';
  claimText.textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;

  btn.disabled = elapsedAfterReset < 600;
}

function showClaim() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-container" style="text-align:center;">
      <div class="token-display" style="margin-bottom: 12px;">
        <span id="tokens" style="font-size: 2rem; font-weight: bold;">0.00</span>
        <span class="token-unit" style="font-size: 1rem;">tokens</span>
      </div>
      <button id="main-claim-btn" class="mc-button-anim" disabled style="position: relative; overflow: hidden; width: 250px; height: 50px; font-size: 1.2rem; cursor: pointer; border-radius: 8px; border: none; background: #1E90FF; color: white;">
        <span id="claim-text">Loading...</span>
        <div class="progress-bar" style="position: absolute; bottom: 0; left: 0; height: 5px; background: #4CAF50; width: 0;"></div>
      </button>
    </div>
  `;

  document.getElementById('main-claim-btn').addEventListener('click', handleClaim);
  updateDisplay();
}

// ==============================================
// LANCEMENT
// ==============================================

window.addEventListener('DOMContentLoaded', async () => {
  initTelegramWebApp();
  initParticles();

  if (!userId) {
    console.warn('Utilisateur non identifié.');
    return;
  }

  const sessionLoaded = await chargerSession();

  if (!sessionLoaded) {
    try {
      await demarrerMinage();
    } catch (e) {
      console.error('Erreur démarrage minage:', e);
    }
  }

  showClaim();
});
