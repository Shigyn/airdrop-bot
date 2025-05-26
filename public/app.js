// Ajoutez en haut du fichier, après 'use strict' ou au début
let miningInterval;
let secondsMined = 0;
let isMining = false;

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('WebApp initialized');
  
  try {
    // Vérifiez que l'API Telegram est disponible
    if (!window.Telegram || !window.Telegram.WebApp) {
      console.error('Telegram WebApp SDK not available');
      throw new Error('Telegram WebApp SDK not available');
    }

    // Affichez des informations de débogage
    console.log('Telegram WebApp available:', Telegram.WebApp);
    console.log('Init data:', Telegram.WebApp.initData);
    console.log('Init data unsafe:', Telegram.WebApp.initDataUnsafe);
    
    // Développez l'application pour occuper tout l'écran
    Telegram.WebApp.expand();
    
    // Récupérez les données utilisateur
    const user = Telegram.WebApp.initDataUnsafe?.user;
    const userId = user?.id;
    
    if (!userId) {
      console.error('User not authenticated');
      throw new Error('User not authenticated');
    }

    console.log('User authenticated with ID:', userId);
    
    // Vérifiez si l'authentification est valide
    const authResponse = await fetch('/api/validate-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ initData: Telegram.WebApp.initData })
    });

    if (!authResponse.ok) {
      const errorData = await authResponse.json();
      console.error('Auth validation failed:', errorData);
      throw new Error(errorData.error || 'Invalid Telegram auth');
    }

    const authData = await authResponse.json();
    console.log('Auth validated:', authData);
    
    // Chargez les données utilisateur depuis votre backend
    await loadUserData(userId);
    setupNavigation();
    showClaimView();

  } catch (error) {
    console.error('Initialization error:', error);
    
    // Affichez un message d'erreur clair
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <div class="error-message">
          <h2>Erreur d'initialisation</h2>
          <p>${error.message}</p>
          <p>Merci d'ouvrir cette application depuis le bot Telegram.</p>
          <p>Si vous êtes déjà dans Telegram, essayez de recharger la page.</p>
          <p>Configuration Telegram: ${JSON.stringify(window.Telegram?.WebApp?.initData, null, 2)}</p>
        </div>
      `;
    }

    // Mise à jour de l'UI avec les valeurs par défaut
    const username = document.getElementById('username');
    const balance = document.getElementById('balance');
    const lastClaim = document.getElementById('lastClaim');

    if (username) username.textContent = 'Non connecté';
    if (balance) balance.textContent = '--';
    if (lastClaim) lastClaim.textContent = '--';

    showNotification('Erreur d\'initialisation. Veuillez ouvrir depuis Telegram.', 'error');
  }
});

// Fonction pour charger les données utilisateur
async function loadUserData(userId) {
  try {
    console.log(`Fetching user data for ID: ${userId}`);
    
    const response = await fetch(`/api/user-data?userId=${userId}`, {
      headers: {
        'Telegram-Data': Telegram.WebApp.initData
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }

    const userData = await response.json();
    console.log('User data loaded:', userData);

    // Mettre à jour l'UI avec les données
    const username = document.getElementById('username');
    const balance = document.getElementById('balance');
    const lastClaim = document.getElementById('lastClaim');

    if (username) username.textContent = userData.username || 'Chargement...';
    if (balance) balance.textContent = userData.balance || '--';
    if (lastClaim) lastClaim.textContent = userData.lastClaim || '--';

  } catch (error) {
    console.error('Error loading user data:', error);
    showNotification('Erreur lors du chargement des données utilisateur', 'error');
  }
}

// Configuration de la navigation
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Désactiver tous les boutons
      navButtons.forEach(btn => btn.classList.remove('active'));
      
      // Activer le bouton cliqué
      button.classList.add('active');
      
      // Afficher la vue correspondante
      const viewId = button.id.replace('nav-', '');
      showView(viewId);
    });
  });
}

// Afficher une vue spécifique
function showView(viewId) {
  const content = document.getElementById('content');
  if (!content) return;

  switch (viewId) {
    case 'claim':
      showClaimView();
      break;
    case 'tasks':
      showTasksView();
      break;
    case 'referral':
      showReferralView();
      break;
    default:
      showClaimView();
  }
}

// Afficher la vue de mining
function showClaimView() {
  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div class="claim-view">
      <h2>Mining</h2>
      <div class="claim-actions">
        <button id="claim-btn" class="primary-btn">
          <i class="fas fa-plus"></i> Claim
        </button>
      </div>
    </div>
  `;

  // Ajouter l'événement au bouton Claim
  const claimBtn = document.getElementById('claim-btn');
  if (claimBtn) {
    claimBtn.addEventListener('click', async () => {
      try {
        const response = await fetch('/api/claim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Telegram-Data': Telegram.WebApp.initData
          },
          body: JSON.stringify({ userId: Telegram.WebApp.initDataUnsafe.user.id })
        });

        if (!response.ok) {
          throw new Error('Failed to claim');
        }

        const data = await response.json();
        showNotification(data.message, 'success');
        
        // Rafraîchir les données utilisateur
        await loadUserData(Telegram.WebApp.initDataUnsafe.user.id);

      } catch (error) {
        console.error('Claim error:', error);
        showNotification('Erreur lors du claim', 'error');
      }
    });
  }
}

// Afficher la vue des tâches
async function showTasksView() {
  const content = document.getElementById('content');
  if (!content) return;

  try {
    const response = await fetch('/api/tasks', {
      headers: {
        'Telegram-Data': Telegram.WebApp.initData
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch tasks');
    }

    const tasks = await response.json();
    
    content.innerHTML = `
      <div class="tasks-view">
        <h2>Tâches disponibles</h2>
        <div class="tasks-list">
          ${tasks.map(task => `
            <div class="task-item">
              <h3>${task.description}</h3>
              <p>Récompense: ${task.reward}</p>
              <button class="task-claim-btn" data-task-id="${task.id}">
                ${task.completed ? 'Réclamée' : 'Réclamer'}
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Ajouter les événements aux boutons de tâches
    const taskButtons = document.querySelectorAll('.task-claim-btn');
    taskButtons.forEach(button => {
      if (button.textContent === 'Réclamée') return;

      button.addEventListener('click', async () => {
        const taskId = button.dataset.taskId;
        
        try {
          const response = await fetch('/api/claim-task', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Telegram-Data': Telegram.WebApp.initData
            },
            body: JSON.stringify({ userId: Telegram.WebApp.initDataUnsafe.user.id, taskId })
          });

          if (!response.ok) {
            throw new Error('Failed to claim task');
          }

          const data = await response.json();
          showNotification(data.message, 'success');
          
          // Rafraîchir la vue des tâches
          await showTasksView();
          
          // Rafraîchir les données utilisateur
          await loadUserData(Telegram.WebApp.initDataUnsafe.user.id);

        } catch (error) {
          console.error('Task claim error:', error);
          showNotification('Erreur lors de la réclamation de la tâche', 'error');
        }
      });
    });

  } catch (error) {
    console.error('Error loading tasks:', error);
    showNotification('Erreur lors du chargement des tâches', 'error');
  }
}

// Afficher la vue des parrainages
async function showReferralView() {
  const content = document.getElementById('content');
  if (!content) return;

  try {
    const response = await fetch('/api/referral', {
      headers: {
        'Telegram-Data': Telegram.WebApp.initData
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch referral info');
    }

    const referralInfo = await response.json();
    
    content.innerHTML = `
      <div class="referral-view">
        <h2>Parrainage</h2>
        <div class="referral-info">
          <p>Votre code de parrainage: ${referralInfo.referralCode}</p>
          <p>Points gagnés: ${referralInfo.pointsEarned}</p>
          <p>Nombre de parrainages: ${referralInfo.referralsCount}</p>
          <div class="referrals-list">
            ${referralInfo.referrals.map(referral => `
              <div class="referral-item">
                <p>${referral}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

  } catch (error) {
    console.error('Error loading referral info:', error);
    showNotification('Erreur lors du chargement des informations de parrainage', 'error');
  }
}

// Afficher une notification
function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  if (!notification) return;

  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.remove('hidden');

  setTimeout(() => {
    notification.classList.add('hidden');
  }, 3000);
}

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
    const miningSpeedElement = document.getElementById('mining-speed');
    const miningTimeElement = document.getElementById('mining-time');
    const miningButton = document.getElementById('mining-button');

    if (usernameElement) usernameElement.textContent = data.username || 'Anonymous';
    if (balanceElement) balanceElement.textContent = data.balance ?? '0';
    if (lastClaimElement) lastClaimElement.textContent = data.lastClaim || 'Never';

    // Mettre à jour la vitesse de minage
    if (miningSpeedElement) {
      miningSpeedElement.textContent = `${data.miningSpeed} token/min`;
    }

    // Mettre à jour le temps de minage
    if (miningTimeElement) {
      miningTimeElement.textContent = `${Math.floor(data.miningTime)} min`;
    }

    // Mettre à jour le bouton de minage
    if (miningButton) {
      miningButton.disabled = false;
      miningButton.textContent = 'Commencer le minage';
    }

    return data;
  } catch (error) {
    console.error('Error in loadUserData:', error);
    
    // Fallback UI update
    const usernameElement = document.getElementById('username');
    const balanceElement = document.getElementById('balance');
    const lastClaimElement = document.getElementById('lastClaim');
    const miningSpeedElement = document.getElementById('mining-speed');
    const miningTimeElement = document.getElementById('mining-time');
    const miningButton = document.getElementById('mining-button');

    if (usernameElement) usernameElement.textContent = 'Error';
    if (balanceElement) balanceElement.textContent = '0';
    if (lastClaimElement) lastClaimElement.textContent = 'Unknown';
    if (miningSpeedElement) miningSpeedElement.textContent = '0 token/min';
    if (miningTimeElement) miningTimeElement.textContent = '0 min';
    if (miningButton) {
      miningButton.disabled = true;
      miningButton.textContent = 'Erreur';
    }
    
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