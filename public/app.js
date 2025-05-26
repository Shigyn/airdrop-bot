// Initialisation de l'application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM fully loaded and parsed');
  
  // Vérification de l'environnement Telegram
  if (!window.Telegram || !window.Telegram.WebApp) {
    console.error('Telegram WebApp SDK not loaded');
    showNotification('Error: Telegram context not available', 'error');
    return;
  }

  // Initialisation de l'application Web Telegram
  Telegram.WebApp.expand();
  Telegram.WebApp.enableClosingConfirmation();
  Telegram.WebApp.BackButton.onClick(() => Telegram.WebApp.close());

  // Récupération des données utilisateur
  const initData = Telegram.WebApp.initData || {};
  const userId = initData.user?.id;
  
  if (!userId) {
    showNotification('Error: User not authenticated', 'error');
    return;
  }

  // Chargement des données utilisateur
  try {
    await loadUserData(userId);
    setupNavigation();
    showClaimView();
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification('Failed to load app data', 'error');
  }
});

// Fonction pour charger les données utilisateur
async function loadUserData(userId) {
  try {
    const response = await fetch(`/api/user-data?userId=${userId}`);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    // Mise à jour de l'UI
    document.getElementById('username').textContent = data.username || 'Anonymous';
    document.getElementById('balance').textContent = data.balance || '0';
    document.getElementById('lastClaim').textContent = data.lastClaim || 'Never';

    return data;
  } catch (error) {
    console.error('Error loading user data:', error);
    showNotification('Failed to load user data', 'error');
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
  const userId = Telegram.WebApp.initData?.user?.id;
  
  if (!userId) {
    content.innerHTML = '<p>Error: User not authenticated</p>';
    return;
  }

  // HTML pour la vue Claim
  content.innerHTML = `
    <div class="claim-container">
      <div class="mining-stats">
        <div class="stat-card">
          <img src="./images/mining.png" alt="Mining" class="stat-icon" loading="lazy" />
          <div class="stat-info">
            <span class="stat-label">Mining Session</span>
            <span id="mining-time" class="stat-value">00:00:00</span>
          </div>
        </div>
        <div class="stat-card">
          <img src="./images/speed.png" alt="Speed" class="stat-icon" loading="lazy" />
          <div class="stat-info">
            <span class="stat-label">Mining Speed</span>
            <span id="mining-speed" class="stat-value">1 token/min</span>
          </div>
        </div>
      </div>
      <button id="start-mining" class="action-btn">
        <img src="./images/start.png" alt="Start" class="btn-icon" loading="lazy" />
        Start Mining
      </button>
      <button id="claim-tokens" class="action-btn claim-btn" disabled>
        <img src="./images/claim.png" alt="Claim" class="btn-icon" loading="lazy" />
        Claim Tokens (<span id="claim-amount">0</span>)
      </button>
    </div>
  `;

  // Gestionnaires d'événements pour les boutons
  const startBtn = document.getElementById('start-mining');
  const claimBtn = document.getElementById('claim-tokens');
  
  let miningInterval;
  let secondsMined = 0;
  let isMining = false;

  startBtn.addEventListener('click', async () => {
    if (isMining) return;
    
    try {
      const response = await fetch('/start-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          deviceId: generateDeviceId() 
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        showNotification(data.message || 'Failed to start session', 'error');
        return;
      }
      
      isMining = true;
      startBtn.disabled = true;
      claimBtn.disabled = false;
      
      // Démarrer le minuteur
      miningInterval = setInterval(() => {
        secondsMined++;
        updateMiningDisplay(secondsMined);
      }, 1000);
      
      showNotification('Mining session started!', 'success');
    } catch (error) {
      console.error('Error starting session:', error);
      showNotification('Failed to start mining', 'error');
    }
  });

  claimBtn.addEventListener('click', async () => {
    if (!isMining) return;
    
    try {
      const minutesMined = Math.floor(secondsMined / 60);
      const response = await fetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          deviceId: generateDeviceId(),
          miningTime: minutesMined
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        showNotification(data.message || 'Claim failed', 'error');
        return;
      }
      
      // Réinitialiser l'état minier
      clearInterval(miningInterval);
      isMining = false;
      secondsMined = 0;
      startBtn.disabled = false;
      claimBtn.disabled = true;
      updateMiningDisplay(0);
      
      // Mettre à jour le solde affiché
      document.getElementById('balance').textContent = data.balance;
      
      showNotification(data.message || 'Tokens claimed successfully!', 'success');
    } catch (error) {
      console.error('Error claiming tokens:', error);
      showNotification('Failed to claim tokens', 'error');
    }
  });

  // Charger la vitesse de minage
  try {
    const userData = await fetch(`/api/user-data?userId=${userId}`).then(r => r.json());
    if (userData.mining_speed) {
      document.getElementById('mining-speed').textContent = 
        `${userData.mining_speed} token${userData.mining_speed !== 1 ? 's' : ''}/min`;
    }
  } catch (error) {
    console.error('Error loading mining speed:', error);
  }
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