// Ajoutez en haut du fichier, après 'use strict' ou au début
let miningInterval;
let secondsMined = 0;
let isMining = false;

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('WebApp initialized');
  
  // Vérifiez que l'API Telegram est disponible
  if (window.Telegram && window.Telegram.WebApp) {
    // Affichez des informations de débogage
    console.log('Telegram WebApp available:', Telegram.WebApp);
    console.log('Init data:', Telegram.WebApp.initData);
    console.log('Init data unsafe:', Telegram.WebApp.initDataUnsafe);
    
    // Développez l'application pour occuper tout l'écran
    Telegram.WebApp.expand();
    
    // Récupérez les données utilisateur
    const user = Telegram.WebApp.initDataUnsafe?.user;
    const userId = user?.id;
    
    if (userId) {
      console.log('User authenticated with ID:', userId);
      try {
        // Chargez les données utilisateur depuis votre backend
        await loadUserData(userId);
        setupNavigation();
        showClaimView();
      } catch (error) {
        console.error('Error loading user data:', error);
        showNotification('Failed to load user data', 'error');
      }
    } else {
      console.error('User not authenticated');
      showNotification('Please open this app from Telegram', 'error');
      // Affichez un message plus convivial pour les utilisateurs
      document.getElementById('content').innerHTML = `
        <div class="auth-error">
          <h2>Authentication Required</h2>
          <p>Please open this application from within the Telegram bot to continue.</p>
          <p>If you're already in Telegram, try refreshing the page.</p>
        </div>
      `;
    }
  } else {
    console.error('Telegram WebApp SDK not available');
    // Mode de secours pour le débogage hors de Telegram
    if (process.env.NODE_ENV === 'development') {
      showNotification('Running in development mode', 'info');
      // Chargez des données factices pour le développement
      document.getElementById('username').textContent = 'Dev User';
      document.getElementById('balance').textContent = '1000';
      document.getElementById('lastClaim').textContent = new Date().toLocaleString();
      setupNavigation();
      showClaimView();
    } else {
      showNotification('Please open in Telegram', 'error');
      document.getElementById('content').innerHTML = `
        <div class="auth-error">
          <h2>Telegram Required</h2>
          <p>This application only works within the Telegram messenger.</p>
          <p>Please open it from our Telegram bot.</p>
        </div>
      `;
    }
  }
});

// Fonction pour charger les données utilisateur
async function loadUserData(userId) {
  try {
    console.log(`Fetching user data for ID: ${userId}`); // Debug
    
    const response = await fetch(`/api/user-data?userId=${userId}`, {
      headers: {
        'Telegram-Data': window.Telegram.WebApp.initData || '',
        'Content-Type': 'application/json'
      }
    });

    console.log('Response status:', response.status); // Debug
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error:', errorData);
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('User data received:', data); // Debug

    if (data.error) {
      throw new Error(data.error);
    }

    // Mise à jour de l'UI
    const usernameElement = document.getElementById('username');
    const balanceElement = document.getElementById('balance');
    const lastClaimElement = document.getElementById('lastClaim');

    if (usernameElement) usernameElement.textContent = data.username || 'Anonymous';
    if (balanceElement) balanceElement.textContent = data.balance ?? '0';
    if (lastClaimElement) lastClaimElement.textContent = data.lastClaim || 'Never';

    // Mettre à jour la vitesse de minage si disponible
    if (data.mining_speed) {
      const miningSpeedElement = document.getElementById('mining-speed');
      if (miningSpeedElement) {
        miningSpeedElement.textContent = `${data.mining_speed} token/min`;
      }
    }

    return data;
  } catch (error) {
    console.error('Error in loadUserData:', error);
    
    // Fallback UI update
    const usernameElement = document.getElementById('username');
    const balanceElement = document.getElementById('balance');
    const lastClaimElement = document.getElementById('lastClaim');

    if (usernameElement) usernameElement.textContent = 'Error';
    if (balanceElement) balanceElement.textContent = '0';
    if (lastClaimElement) lastClaimElement.textContent = 'Unknown';
    
    showNotification('Failed to load user data. Please try again.', 'error');
    throw error;
  }
}

// Configuration de la navigation avec gestion d'erreurs
function setupNavigation() {
  try {
    const navButtons = document.querySelectorAll('.nav-btn');
    if (!navButtons || navButtons.length === 0) {
      throw new Error('Navigation buttons not found');
    }

    navButtons.forEach(button => {
      button.addEventListener('click', async () => {
        try {
          const viewId = button.id.replace('nav-', '');
          const activeBtn = document.querySelector('.nav-btn.active');
          if (activeBtn) activeBtn.classList.remove('active');
          button.classList.add('active');

          await showView(viewId);
        } catch (error) {
          console.error('Error handling navigation:', error);
          showNotification('Error switching view', 'error');
        }
      });
    });
  } catch (error) {
    console.error('Navigation setup error:', error);
    showNotification('Error setting up navigation', 'error');
  }
}

async function showView(viewId) {
  try {
    const content = document.getElementById('content');
    if (!content) {
      throw new Error('Content container not found');
    }

    content.innerHTML = '<div class="loading-spinner"></div>';

    switch (viewId) {
      case 'claim':
        await showClaimView();
        break;
      case 'tasks':
        await showTasksView();
        break;
      case 'referral':
        await showReferralView();
        break;
      default:
        throw new Error(`Unknown view: ${viewId}`);
    }
  } catch (error) {
    console.error('Error displaying view:', error);
    showNotification('Error displaying view', 'error');
    
    // Afficher un message d'erreur dans le contenu
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <div class="error-message">
          <h3>Error</h3>
          <p>${error.message}</p>
        </div>
      `;
    }
  }
}

// Vue Claim (Mining)
async function showClaimView() {
  const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
  const content = document.getElementById('content');
  
  content.innerHTML = `
    <div class="claim-container">
      <div class="mining-stats">
        <div class="stat-card">
          <img src="./images/speed.png" alt="Speed" class="stat-icon" />
          <div class="stat-info">
            <span class="stat-label">Mining Speed</span>
            <span id="mining-speed" class="stat-value">1 token/min</span>
          </div>
        </div>
        <div class="stat-card">
          <img src="./images/time.png" alt="Time" class="stat-icon" />
          <div class="stat-info">
            <span class="stat-label">Session Time</span>
            <span id="mining-time" class="stat-value">00:00:00</span>
          </div>
        </div>
      </div>
      
      <button id="mining-btn" class="action-btn">
        <img src="./images/start.png" alt="Start" class="btn-icon" />
        Start Mining
      </button>
      
      <div class="session-info">
        <p>• Session max: 60 minutes</p>
        <p>• Claim possible dès 30 secondes</p>
      </div>
    </div>
  `;

  // Charger la vitesse de minage
  try {
    const speedData = await fetch(`/api/user-data?userId=${userId}`).then(r => r.json());
    if (speedData.mining_speed) {
      document.getElementById('mining-speed').textContent = 
        `${speedData.mining_speed} token/min`;
    }
  } catch (error) {
    console.error('Failed to load mining speed:', error);
  }

  // Gestionnaire du bouton
  document.getElementById('mining-btn').addEventListener('click', handleMiningAction);
}

    } catch (error) {
      console.error('Start mining error:', error);
      errorDisplay.textContent = error.message;
      errorDisplay.classList.remove('hidden');
    }
  });

  // Gestionnaire pour le bouton Claim
  document.getElementById('claim-tokens').addEventListener('click', async () => {
    try {
      const response = await fetch('/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': Telegram.WebApp.initData || ''
        },
        body: JSON.stringify({
          userId,
          deviceId: generateDeviceId(),
          miningTime: getCurrentMiningTime()
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.message || 'Claim failed');
      }

      // Mettre à jour le solde affiché
      document.getElementById('balance').textContent = data.balance;
      showNotification('Tokens claimed successfully!', 'success');

    } catch (error) {
      console.error('Claim error:', error);
      errorDisplay.textContent = error.message;
      errorDisplay.classList.remove('hidden');
    }
  });
}

function updateMiningDisplay(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  document.getElementById('mining-time').textContent = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  // Mettre à jour le bouton
  const miningBtn = document.getElementById('mining-btn');
  if (seconds >= 30) { // 30 secondes minimum pour claim
    miningBtn.innerHTML = `
      <img src="./images/claim.png" alt="Claim" class="btn-icon" />
      Claim (${Math.floor(seconds/60)}m)
    `;
    miningBtn.classList.add('claim-ready');
  } else {
    miningBtn.innerHTML = `
      <img src="./images/mining.png" alt="Mining" class="btn-icon" />
      Mining...
    `;
    miningBtn.classList.remove('claim-ready');
  }
}

async function handleMiningAction() {
  const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
  if (!userId) {
    showNotification('User not authenticated', 'error');
    return;
  }

  const miningBtn = document.getElementById('mining-btn');
  miningBtn.disabled = true;

  try {
    if (!isMining) {
      // Démarrer la session
      const response = await fetch('/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': Telegram.WebApp.initData || ''
        },
        body: JSON.stringify({
          userId,
          deviceId: generateDeviceId()
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.message);

      // Démarrer le minage
      isMining = true;
      secondsMined = 0;
      miningInterval = setInterval(() => {
        secondsMined++;
        updateMiningDisplay(secondsMined);
        
        // Arrêter à 60 minutes
        if (secondsMined >= 3600) {
          clearInterval(miningInterval);
          miningBtn.disabled = false;
        }
      }, 1000);

    } else {
      // Claimer les tokens
      const minutes = Math.min(Math.floor(secondsMined / 60), 60);
      const claimResponse = await fetch('/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': Telegram.WebApp.initData || ''
        },
        body: JSON.stringify({
          userId,
          deviceId: generateDeviceId(),
          miningTime: minutes
        })
      });

      const claimData = await claimResponse.json();
      if (claimData.error) throw new Error(claimData.message);

      // Réinitialiser
      clearInterval(miningInterval);
      isMining = false;
      secondsMined = 0;
      updateMiningDisplay(0);
      document.getElementById('balance').textContent = claimData.balance;
      showNotification(`Claimed ${claimData.claimed} tokens!`, 'success');
    }
  } catch (error) {
    console.error('Mining error:', error);
    showNotification(error.message, 'error');
  } finally {
    miningBtn.disabled = false;
  }
}

// Vue Tasks
async function showTasksView() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="tasks-container">
      <h2 class="section-title">Available Tasks</h2>
      <div id="tasks-list" class="tasks-list">
        <div class="loading-spinner"></div>
      </div>
    </div>
  `;
  
  try {
    const response = await fetch('/api/tasks');
    const tasks = await response.json();
    
    const tasksList = document.getElementById('tasks-list');
    tasksList.innerHTML = '';
    
    if (tasks.error || !tasks.length) {
      tasksList.innerHTML = '<p class="no-tasks">No tasks available at the moment</p>';
      return;
    }
    
    tasks.forEach(task => {
      const taskElement = document.createElement('div');
      taskElement.className = 'task-card';
      taskElement.innerHTML = `
        <img src="${task.image}" alt="${task.title}" class="task-image" loading="lazy" />
        <div class="task-info">
          <h3 class="task-title">${task.title}</h3>
          <p class="task-reward">Reward: ${task.reward} tokens</p>
          <button class="task-btn">Complete Task</button>
        </div>
      `;
      tasksList.appendChild(taskElement);
    });
  } catch (error) {
    console.error('Error loading tasks:', error);
    document.getElementById('tasks-list').innerHTML = 
      '<p class="error-message">Failed to load tasks. Please try again later.</p>';
  }
}

// Vue Referral
async function showReferralView() {
  const content = document.getElementById('content');
  const userId = Telegram.WebApp.initData?.user?.id;
  
  if (!userId) {
    content.innerHTML = '<p>Error: User not authenticated</p>';
    return;
  }
  
  content.innerHTML = `
    <div class="referral-container">
      <h2 class="section-title">Referral Program</h2>
      <div class="referral-stats">
        <div class="stat-card">
          <span class="stat-label">Your Referral Code</span>
          <span id="referral-code" class="stat-value">Loading...</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Total Referrals</span>
          <span id="total-referrals" class="stat-value">0</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Total Earned</span>
          <span id="total-earned" class="stat-value">0 tokens</span>
        </div>
      </div>
      <div class="referral-share">
        <p>Share your referral link and earn 10% of your referrals' mining rewards!</p>
        <div class="referral-link-container">
          <input type="text" id="referral-link" readonly class="referral-link-input" />
          <button id="copy-referral" class="copy-btn">
            <i class="fas fa-copy"></i>
          </button>
        </div>
        <button id="share-referral" class="action-btn">
          <i class="fas fa-share-alt"></i> Share Link
        </button>
      </div>
    </div>
  `;
  
  try {
    const response = await fetch('/api/referrals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    document.getElementById('referral-code').textContent = data.referralCode;
    document.getElementById('total-referrals').textContent = data.totalReferrals;
    document.getElementById('total-earned').textContent = `${data.totalEarned} tokens`;
    document.getElementById('referral-link').value = data.referralUrl;
    
    // Gestionnaires d'événements pour les boutons
    document.getElementById('copy-referral').addEventListener('click', () => {
      const linkInput = document.getElementById('referral-link');
      linkInput.select();
      document.execCommand('copy');
      showNotification('Link copied to clipboard!', 'success');
    });
    
    document.getElementById('share-referral').addEventListener('click', () => {
      if (window.Telegram && window.Telegram.WebApp) {
        Telegram.WebApp.shareUrl(data.referralUrl);
      } else {
        showNotification('Sharing is only available in the Telegram app', 'info');
      }
    });
    
  } catch (error) {
    console.error('Error loading referral data:', error);
    document.getElementById('referral-code').textContent = 'Error loading data';
    showNotification('Failed to load referral data', 'error');
  }
}

// Fonction utilitaire pour générer un ID de périphérique
function generateDeviceId() {
  return 'device-' + Math.random().toString(36).substr(2, 9);
}

// Fonction pour afficher les notifications
function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  if (!notification) return;
  
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.remove('hidden');
  
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 5000);
}