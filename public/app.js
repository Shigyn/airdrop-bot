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
    document.getElementById('username').textContent = data.username || 'Anonymous';
    document.getElementById('balance').textContent = data.balance ?? '0';
    document.getElementById('lastClaim').textContent = data.lastClaim || 'Never';

    return data;
  } catch (error) {
    console.error('Error in loadUserData:', error);
    
    // Fallback UI update
    document.getElementById('username').textContent = 'Error';
    document.getElementById('balance').textContent = '0';
    document.getElementById('lastClaim').textContent = 'Unknown';
    
    showNotification('Failed to load user data. Please try again.', 'error');
    throw error;
  }
}

// Configuration de la navigation
function setupNavigation() {
  const navButtons = {
    'nav-claim': showClaimView,
    'nav-tasks': showTasksView,
    'nav-referral': showReferralView
  };

  Object.entries(navButtons).forEach(([id, handler]) => {
    const button = document.getElementById(id);
    if (button) {
      button.addEventListener('click', () => {
        // Mettre à jour l'état actif des boutons
        document.querySelectorAll('.nav-btn').forEach(btn => 
          btn.classList.remove('active'));
        button.classList.add('active');
        
        // Exécuter le gestionnaire
        handler();
      });
    }
  });
}

// Vue Claim (Mining)
async function showClaimView() {
  const content = document.getElementById('content');
  const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
  
  if (!userId) {
    content.innerHTML = '<p class="error">Please open in Telegram</p>';
    return;
  }

  // HTML pour la vue Claim
  content.innerHTML = `
    <div class="claim-container">
      <div class="mining-stats">
        <div class="stat-card">
          <img src="./images/mining.png" alt="Mining" class="stat-icon" />
          <div class="stat-info">
            <span class="stat-label">Mining Session</span>
            <span id="mining-time" class="stat-value">00:00:00</span>
          </div>
        </div>
        <div class="stat-card">
          <img src="./images/speed.png" alt="Speed" class="stat-icon" />
          <div class="stat-info">
            <span class="stat-label">Mining Speed</span>
            <span id="mining-speed" class="stat-value">1 token/min</span>
          </div>
        </div>
      </div>
      <div id="mining-controls">
        <button id="start-mining" class="action-btn">
          <img src="./images/start.png" alt="Start" class="btn-icon" />
          Start Mining
        </button>
        <button id="claim-tokens" class="action-btn claim-btn" disabled>
          <img src="./images/claim.png" alt="Claim" class="btn-icon" />
          Claim Tokens (<span id="claim-amount">0</span>)
        </button>
      </div>
      <div id="mining-error" class="error-message hidden"></div>
    </div>
  `;

  // Gestion des erreurs
  const errorDisplay = document.getElementById('mining-error');

  // Récupérer la vitesse de minage
  try {
    const speedResponse = await fetch(`/api/user-data?userId=${userId}`);
    const speedData = await speedResponse.json();
    if (speedData.mining_speed) {
      document.getElementById('mining-speed').textContent = 
        `${speedData.mining_speed} token/min`;
    }
  } catch (error) {
    console.error('Failed to load mining speed:', error);
  }

  // Gestionnaire pour le bouton Start
  document.getElementById('start-mining').addEventListener('click', async () => {
    try {
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

      if (data.error) {
        throw new Error(data.message || 'Failed to start session');
      }

      // Démarrer le minage ici...
      startMiningTimer();

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
  
  const minutesMined = Math.floor(seconds / 60);
  document.getElementById('claim-amount').textContent = minutesMined;
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