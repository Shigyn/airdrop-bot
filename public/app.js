// Variables globales
let tg, userId;
let balance = 0;
let miningInterval;
let sessionStartTime = Date.now();
let tokens = 0;
let deviceId; // Changé de const à let pour permettre la modification
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

// ==============================================
// FONCTIONS PRINCIPALES
// ==============================================

function initTelegramWebApp() {
  console.log("Initialisation de Telegram WebApp...");
  
  if (!window.Telegram?.WebApp) {
    console.error("WebApp Telegram non détecté - Mode test activé");
    tg = { 
      WebApp: {
        initDataUnsafe: { user: { id: "test_user", username: "TestUser" }},
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

function sauvegarderSession() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('miningSession', JSON.stringify({
      sessionStartTime,
      tokens,
      userId,
      deviceId,
      lastSave: Date.now() // Ajout du timestamp de sauvegarde
    }));
  }
}

async function chargerSession() {
  if (typeof localStorage !== 'undefined' && userId) {
    const session = localStorage.getItem('miningSession');
    if (session) {
      const parsed = JSON.parse(session);
      
      // Vérification plus robuste de la session
      if (parsed.userId === userId && parsed.deviceId === deviceId) {
        
        // Vérifier avec le backend si la session est toujours valide
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
            
            // Restaurer seulement si le backend confirme
            if (data.valid) {
              const now = Date.now();
              const elapsedSeconds = (now - parsed.sessionStartTime) / 1000;
              
              // Ne pas dépasser la durée max de session (60 minutes)
              if (elapsedSeconds <= 3600) {
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
  
  // Si on arrive ici, la session est invalide
  return false;
}

async function demarrerMinage() {
  if (miningInterval) {
    clearInterval(miningInterval);
  }

  try {
    // Vérifier d'abord la session côté serveur
    const sessionResponse = await fetch('/api/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, deviceId })
    });

    if (!sessionResponse.ok) {
      const errorData = await sessionResponse.json();
      throw new Error(errorData.error || 'SESSION_VERIFICATION_FAILED');
    }

    const sessionData = await sessionResponse.json();
    
    if (sessionData.valid) {
      // Si session valide, récupérer les données utilisateur pour avoir le bon Mining_Speed
      const userData = await loadUserData();
      Mining_Speed = userData.mining_speed || 1;
      
      miningInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = (now - sessionStartTime) / 1000;
        const sessionCap = 60 * Mining_Speed;
        tokens = Math.min(elapsed * (1/60) * Mining_Speed, sessionCap);

        updateDisplay();
        sauvegarderSession();

        fetch('/update-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, tokens, deviceId })
        }).catch(console.error);
      }, 1000);
    } else {
      // Si session invalide, en démarrer une nouvelle
      await startNewSession();
    }
  } catch (error) {
    console.error('Session error:', error);
    await startNewSession();
  }
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
  
  // Relancer le minage après avoir démarré une nouvelle session
  demarrerMinage();
}

// Modifier la fonction handleClaim
async function handleClaim() {
  const btn = document.getElementById('main-claim-btn');
  if (!btn) return;

  const originalHTML = btn.innerHTML;
  const originalDisabled = btn.disabled;

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-mini"></div>';

  try {
    // 1. Vérification de session
    const sessionCheck = await fetch('/api/verify-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': window.Telegram?.WebApp?.initData || '{}'
      },
      body: JSON.stringify({
        userId,
        deviceId
      })
    });

    if (!sessionCheck.ok) {
      const errorData = await sessionCheck.json();
      throw new Error(errorData.error || 'SESSION_VERIFICATION_FAILED');
    }

    // 2. Envoi du claim
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
        deviceId // Ajouter deviceId ici
      })
    });

    if (!claimResponse.ok) {
      const errorData = await claimResponse.json();
      throw new Error(errorData.error || 'CLAIM_FAILED');
    }

    const result = await claimResponse.json();
    
    // 3. Réinitialisation après succès
    tokens = 0;
    sessionStartTime = Date.now();
    Mining_Speed = result.m || 1; // Mettre à jour le mining speed
    
    btn.innerHTML = '<span style="color:#4CAF50">✓ Réussi</span>';
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = originalDisabled;
      updateDisplay();
    }, 1500);

    // Mettre à jour le solde affiché
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
      
      // Si erreur de session, redémarrer une nouvelle session
      if (error.message === 'SESSION_VERIFICATION_FAILED' || 
          error.message === 'DEVICE_MISMATCH') {
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

  // Si elapsed >= 60 mn, on reset le timer à 0 et tokens à 0
  if (elapsed >= sessionDuration) {
    sessionStartTime = Date.now();  // relance la session
    tokens = 0;
  }

  const elapsedAfterReset = (now - sessionStartTime) / 1000;
  const remainingTime = Math.max(0, sessionDuration - elapsedAfterReset);

  tokensDisplay.textContent = tokens.toFixed(2);

  // Met à jour barre et texte countdown
  const percent = (elapsedAfterReset / sessionDuration) * 100;
  progressBar.style.width = `${percent}%`;

  const mins = Math.floor(remainingTime / 60);
  const secs = Math.floor(remainingTime % 60);

  claimText.style.whiteSpace = 'nowrap';
  claimText.style.fontSize = '1rem';
  claimText.textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;

  // active le bouton après 10 min
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
  // Fonction inutilisée, mais corrigée si besoin
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

  let startTime = Date.now();
  let endTime = startTime + durationSeconds * 1000;

  function update() {
    const now = Date.now();
    const elapsed = now - startTime;
    const percent = Math.min(elapsed / (durationSeconds * 1000), 1);
    progress.style.width = (percent * 100) + '%';

    const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
    const countdown = button.querySelector('.countdown');
    if (countdown) countdown.textContent = remaining + "s";

    if (percent < 1) {
      requestAnimationFrame(update);
    } else if (countdown) {
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
    const response = await fetch(`${backendUrl}/api/user/${userId}`, {  // Notez le /api/ ajouté
      headers: { 
        'Content-Type': 'application/json',
        'Telegram-Data': tg.initData || 'mock-data' 
      }
    });
    
    if (!response.ok) {
      // Si 404, on crée un utilisateur par défaut
      if (response.status === 404) {
        return {
          username: tg.initDataUnsafe.user?.username || "Anonyme",
          balance: "0",
          lastClaim: "Jamais",
          mining_speed: 1
        };
      }
      throw new Error(`Erreur HTTP ${response.status}`);
    }
    
    const data = await response.json();

    // Mise à jour UI
    document.getElementById('username').textContent = data.username || "Anonyme";
    document.getElementById('balance').textContent = data.balance ?? "0";
    document.getElementById('lastClaim').textContent = data.lastClaim ? 
      new Date(data.lastClaim).toLocaleString('fr-FR') : "Jamais";

    Mining_Speed = data.mining_speed ?? 1;

    return data;
  } catch (error) {
    console.error("Erreur de chargement:", error);
    // Retourner des valeurs par défaut en cas d'erreur
    return {
      username: "Anonyme",
      balance: "0",
      lastClaim: "Erreur",
      mining_speed: 1
    };
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

const TasksPage = {
  async showTasksPage() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loader">Chargement...</div>';

    try {
      const response = await fetch('/api/tasks');
      
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      
      const tasks = await response.json();
      
      if (!tasks || !tasks.length) {
        content.innerHTML = '<div class="no-tasks">Aucune tâche disponible</div>';
        return;
      }

      content.innerHTML = `
        <div class="tasks-container">
          ${tasks.map(task => `
            <div class="task-card ${task.status}">
              <img src="${task.icon}" alt="${task.name}" onerror="this.src='/images/default-task.png'">
              <h3>${task.name}</h3>
              <p>Récompense: ${task.reward} tokens</p>
              <button onclick="TasksPage.completeTask('${task.id}')" 
                ${task.status === 'completed' ? 'disabled' : ''}>
                ${task.status === 'completed' ? '✓ Fait' : 'Compléter'}
              </button>
            </div>
          `).join('')}
        </div>
      `;
    } catch (error) {
      console.error("Tasks error:", error);
      content.innerHTML = `
        <div class="error">
          Erreur de chargement. <button onclick="TasksPage.showTasksPage()">Réessayer</button>
        </div>
      `;
    }
  },

  async completeTask(taskId) {
    // Envoyer la complétion au backend
    await fetch('/api/complete-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, userId })
    });
    this.showTasksPage(); // Recharger
  }
};

// ==============================================
// INITIALISATION
// ==============================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Initialiser Telegram WebApp
    initTelegramWebApp();
    
    // 2. Afficher l'interface de base
    initParticles();
    setupNavigation();
    showClaim(); // Afficher l'interface même si le chargement échoue
    
    // 3. Charger les données (en arrière-plan)
    loadUserData().catch(console.error);
    
    // 4. Démarrer le minage
    demarrerMinage().catch(console.error);
    
  } catch (error) {
    console.error("Erreur d'initialisation:", error);
    // Afficher une erreur mais garder l'interface utilisable
    const notification = document.createElement('div');
    notification.className = 'error-notification';
    notification.textContent = `Erreur: ${error.message}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
  }
});