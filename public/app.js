'use strict';

// Variables globales
let miningInterval;
let secondsMined = 0;
let isMining = false;

// Fonctions utilitaires

// Fonction d'initialisation
async function initializeApp() {
  try {
    const userId = Telegram.WebApp.initData?.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Charger les données utilisateur
    await loadUserData();

    // Configurer les événements de navigation
    setupNavigation();

    // Afficher la vue initiale
    await showView('claim');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation:', error);
    showNotification('Erreur lors de l\'initialisation de l\'application', 'error');
  }
}

// Fonctions utilitaires
function showNotification(message, type = 'info') {
  try {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  } catch (error) {
    console.error('Error showing notification:', error);
  }
}

// Initialiser l'application au chargement
document.addEventListener('DOMContentLoaded', initializeApp);

// Fonctions de navigation
function setupNavigation() {
  try {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        const viewId = button.dataset.view;
        
        // Désactiver tous les boutons
        navButtons.forEach(btn => btn.classList.remove('active'));
        
        // Activer le bouton cliqué
        button.classList.add('active');
        
        // Afficher la vue correspondante
        await showView(viewId);
      });
    });
  } catch (error) {
    console.error('Error setting up navigation:', error);
    showNotification('Erreur lors de la configuration de la navigation', 'error');
  }
}

// Fonctions de données utilisateur
// Fonction pour charger les données utilisateur
async function loadUserData() {
  try {
    // Vérifier l'authentification
    if (!Telegram.WebApp.initData) {
      throw new Error('Telegram Web App not initialized');
    }
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Récupérer les données utilisateur
    const response = await fetch('/api/user-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch user data');
    }

    const userData = await response.json();
    if (!userData || !userData.username || !userData.balance) {
      throw new Error('Invalid user data received');
    }

    console.log('User data loaded:', userData);

    // Mettre à jour l'UI avec les données
    const username = document.getElementById('username');
    const balance = document.getElementById('balance');
    const lastClaim = document.getElementById('lastClaim');

    if (username) {
      username.textContent = userData.username;
    } else {
      console.error('Username element not found');
    }

    if (balance) {
      balance.textContent = userData.balance;
    } else {
      console.error('Balance element not found');
    }

    if (lastClaim) {
      lastClaim.textContent = userData.lastClaim ? new Date(userData.lastClaim).toLocaleString() : 'Never claimed';
    } else {
      console.error('Last claim element not found');
    }

    return userData;
  } catch (error) {
    console.error('Error loading user data:', error);
    showNotification('Erreur lors du chargement des données utilisateur', 'error');
    throw error;
  }
}
// Fonctions de minage
function startMining(userId) {
  try {
    if (!userId) throw new Error('User not authenticated');

    const miningBtn = document.getElementById('mining-btn');
    if (!miningBtn) throw new Error('Mining button not found');

    miningBtn.innerHTML = `
      <img src="./images/stop.png" alt="Stop" class="btn-icon" />
      Stop Mining
    `;
    miningBtn.classList.add('active');

    // Démarrer l'animation de minage
    const miningAnimation = document.getElementById('mining-animation');
    if (miningAnimation) {
      miningAnimation.classList.add('active');
    }

    // Démarrer l'interval de minage
    miningInterval = setInterval(() => {
      secondsMined++;
      updateMiningDisplay(secondsMined);
    }, 1000);
  } catch (error) {
    console.error('Error starting mining:', error);
    showNotification('Erreur lors du démarrage du minage', 'error');
  }
}

// Fonction pour arrêter le minage
function stopMining() {
  try {
    if (!isMining) return;

    const miningBtn = document.getElementById('mining-btn');
    if (!miningBtn) throw new Error('Mining button not found');

    miningBtn.innerHTML = `
      <img src="./images/start.png" alt="Start" class="btn-icon" />
      Start Mining
    `;
    miningBtn.classList.remove('active');
    miningBtn.classList.remove('mining-active');

    // Arrêter l'animation de minage
    const miningAnimation = document.getElementById('mining-animation');
    if (miningAnimation) {
      miningAnimation.classList.remove('active');
    }

    // Arrêter l'interval de minage
    clearInterval(miningInterval);
    isMining = false;
  } catch (error) {
    console.error('Error stopping mining:', error);
    showNotification('Erreur lors de l\'arrêt du minage', 'error');
  }
}

// Fonction pour gérer l'action de minage
async function handleMiningAction() {
  try {
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) {
      showNotification('User not authenticated', 'error');
      return;
    }

    const miningBtn = document.getElementById('mining-btn');
    if (!miningBtn) {
      console.error('Mining button not found');
      return;
    }

    miningBtn.disabled = true;

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
          isMining = false;
        }
      }, 1000);
    } else {
      // Arrêter le minage
      isMining = false;
      clearInterval(miningInterval);
      miningBtn.disabled = false;
    }
  } catch (error) {
    console.error('Error in mining action:', error);
    showNotification('Error in mining action', 'error');
    miningBtn.disabled = false;
    isMining = false;
    clearInterval(miningInterval);
  }
}

    // Mettre à jour le temps de minage
    updateMiningTime();

    // Démarrer l'intervalle de minage
    miningInterval = setInterval(async () => {
      try {
        secondsMined++;
        updateMiningTime();

        // Claim automatique après 30 secondes
        if (secondsMined >= 30) {
          await claimTokens();
        }
      } catch (error) {
        console.error('Error in mining interval:', error);
        showNotification('Erreur lors du minage', 'error');
      }
    }, 1000);
  } catch (error) {
    console.error('Error starting mining:', error);
    showNotification(`Erreur: ${error.message}`, 'error');
    showNotification('Erreur critique lors du démarrage du minage', 'error');
    throw error; // Propager l'erreur pour la gestion globale
  }
}

function stopMining() {
  try {
    try {
      if (!isMining) return;

      const miningBtn = document.getElementById('mining-btn');
      if (!miningBtn) throw new Error('Mining button not found');

      miningBtn.innerHTML = `
        <img src="./images/start.png" alt="Start" class="btn-icon" />
        Start Mining
      `;
      miningBtn.classList.remove('mining-active');

      isMining = false;
      secondsMined = 0;

      if (miningInterval) {
        clearInterval(miningInterval);
        miningInterval = null;
      }

      updateMiningTime();

    } catch (error) {
      console.error('Error in mining stop:', error);
      showNotification('Erreur lors de l\'arrêt du minage', 'error');
      throw error; // Propager l'erreur pour la gestion globale
    }

  } catch (error) {
    console.error('Error in stopMining:', error);
    showNotification('Erreur critique lors de l\'arrêt du minage', 'error');
    throw error; // Propager l'erreur pour la gestion globale
  }
}

function updateMiningTime() {
  try {
    try {
      const miningTime = document.getElementById('mining-time');
      if (!miningTime) return;

      const minutes = Math.floor(secondsMined / 60);
      const seconds = secondsMined % 60;
      const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:00`;
      miningTime.textContent = formattedTime;

    } catch (error) {
      console.error('Error in mining time update:', error);
      throw error; // Propager l'erreur pour la gestion globale
    }

  } catch (error) {
    console.error('Error in updateMiningTime:', error);
    throw error; // Propager l'erreur pour la gestion globale
  }
}

async function claimTokens() {
  try {
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) throw new Error('User not authenticated');

    const response = await fetch('/api/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) {
      throw new Error('Failed to claim tokens');
    }

    const data = await response.json();
    showNotification(data.message || 'Tokens claimed successfully!', 'success');
    
    // Rafraîchir les données utilisateur
    await loadUserData();

    // Réinitialiser le minage
    stopMining();

  } catch (error) {
    console.error('Error claiming tokens:', error);
    showNotification('Erreur lors de la réclamation des tokens', 'error');
  }
}

// Fonctions d'initialisation
function setupUI() {
  try {
    // Configuration de la navigation
    function setupNavigation() {
      try {
        const navButtons = document.querySelectorAll('.nav-button');
        if (!navButtons.length) {
          throw new Error('Navigation buttons not found');
        }

        navButtons.forEach(button => {
          button.addEventListener('click', async () => {
            try {
              const viewId = button.dataset.view;
              if (!viewId) {
                throw new Error('View ID not specified');
              }

              // Désactiver tous les boutons de navigation
              navButtons.forEach(btn => btn.classList.remove('active'));
              
              // Activer le bouton cliqué
              button.classList.add('active');

              // Afficher la vue
              await showView(viewId);

            } catch (error) {
              console.error('Error handling navigation:', error);
              showNotification('Erreur lors du changement de vue', 'error');
              throw error; // Propager l'erreur pour la gestion globale
            }
          });
        });

      } catch (error) {
        console.error('Error setting up navigation buttons:', error);
        showNotification('Erreur lors de la configuration de la navigation', 'error');
        throw error; // Propager l'erreur pour la gestion globale
      }
    }

    try {
      setupNavigation();
    } catch (error) {
      console.error('Error in setupUI:', error);
      showNotification('Erreur lors de l\'initialisation de l\'interface', 'error');
    }

  } catch (error) {
    console.error('Error in setupUI:', error);
    showNotification('Erreur critique lors de l\'initialisation', 'error');
  }
}

// Fonctions d'événements
function setupEventListeners() {
  try {
    // Configuration du bouton de minage
    const miningBtn = document.getElementById('mining-btn');
    if (miningBtn) {
      miningBtn.addEventListener('click', async () => {
        try {
          const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
          if (!userId) throw new Error('User not authenticated');

          if (isMining) {
            stopMining();
          } else {
            startMining(userId);
          }
        } catch (error) {
          console.error('Error handling mining button:', error);
          showNotification('Erreur lors du minage', 'error');
          throw error; // Propager l'erreur pour la gestion globale
        }
      });
    }

    // Configuration du bouton de réclamation
    const claimBtn = document.getElementById('claim-btn');
    if (claimBtn) {
      claimBtn.addEventListener('click', async () => {
        try {
          const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
          if (!userId) throw new Error('User not authenticated');

          await claimTokens();
        } catch (error) {
          console.error('Error handling claim button:', error);
          showNotification('Erreur lors de la réclamation', 'error');
          throw error; // Propager l'erreur pour la gestion globale
        }
      });
    }

    // Configuration du bouton de copie du code de parrainage
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          const code = document.getElementById('referral-code').textContent;
          await navigator.clipboard.writeText(code);
          showNotification('Code copié dans le presse-papiers!', 'success');
        } catch (error) {
          console.error('Error copying code:', error);
          showNotification('Erreur lors de la copie du code', 'error');
          throw error; // Propager l'erreur pour la gestion globale
        }
      });
    }

  } catch (error) {
    console.error('Error in setupEventListeners:', error);
    showNotification('Erreur lors de la configuration des écouteurs', 'error');
    throw error; // Propager l'erreur pour la gestion globale
  }
}

// Initialisation de l'application
async function initApp() {
  try {
    // Initialiser l'interface
    setupUI();
    setupEventListeners();
    
    // Charger les données utilisateur
    await loadUserData();

  } catch (error) {
    console.error('Error initializing app:', error);
    showNotification('Erreur lors de l\'initialisation', 'error');
  }
}

// Démarrage de l'application
try {
  initApp();
} catch (error) {
  console.error('Error in app initialization:', error);
  showNotification('Erreur critique lors du démarrage', 'error');
}

// Fonctions de validation et démarrage
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!window.Telegram || !window.Telegram.WebApp) {
      throw new Error('Telegram WebApp SDK not available');
    }

    console.log('Telegram WebApp available:', Telegram.WebApp);
    console.log('Init data:', Telegram.WebApp.initData);
    console.log('Init data unsafe:', Telegram.WebApp.initDataUnsafe);

    // Initialiser l'interface
    setupUI();
    
    // Charger les données utilisateur
    await loadUserData();

    // Authentification
    try {
      Telegram.WebApp.expand();
      
      const user = Telegram.WebApp.initDataUnsafe?.user;
      const userId = user?.id;
      
      if (!userId) {
        throw new Error('User not authenticated');
      }

      console.log('User authenticated with ID:', userId);
      
      const authResponse = await fetch('/api/validate-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': Telegram.WebApp.initData
        },
        body: JSON.stringify({ initData: Telegram.WebApp.initData })
      });

      const authData = await authResponse.json();
      
      if (!authResponse.ok) {
        throw new Error(authData.error || 'Invalid Telegram auth');
      }

      await loadUserData();
      console.log('Auth validated:', authData);
      setupUI();
    } catch (error) {
      console.error('Error during authentication:', error);
      showNotification('Erreur d\'authentification', 'error');
      
      const content = document.getElementById('content');
      if (content) {
        content.innerHTML = `
          <div class="error-message">
            <h2>Erreur d\'authentification</h2>
            <p>${error.message}</p>
            <p>Merci d\'ouvrir cette application depuis le bot Telegram.</p>
          </div>
        `;
      }
    }

  } catch (error) {
    console.error('Error initializing app:', error);
    showNotification('Erreur lors de l\'initialisation', 'error');
    
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <div class="error-message">
          <h2>Erreur d\'initialisation</h2>
          <p>${error.message}</p>
          <p>Merci d\'ouvrir cette application depuis le bot Telegram.</p>
        </div>
      `;
    }
  }
});

// Fonctions de vue
function showView(viewId) {
  try {
    const content = document.getElementById('content');
    if (!content) throw new Error('Content container not found');

    switch (viewId) {
      case 'home':
        return showHomeView();
      case 'tasks':
        return showTasksView();
      case 'claim':
        return showClaimView();
      case 'referral':
        return showReferralView();
      default:
        throw new Error(`Unknown view: ${viewId}`);
    }
  } catch (error) {
    console.error('Error showing view:', error);
    showNotification('Error showing view', 'error');
    return `
      <div class="error-container">
        <h2>Error</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}
function showView(viewId) {
  try {
    const content = document.getElementById('content');
    if (!content) {
      throw new Error('Content container not found');
    }

    content.innerHTML = '<div class="loading-spinner"></div>';

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
        throw new Error(`Unknown view: ${viewId}`);
    }
  } catch (error) {
    console.error('Error displaying view:', error);
    showNotification('Error displaying view', 'error');
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
  try {
    try {
      const content = document.getElementById('content');
      if (!content) throw new Error('Content container not found');

      const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
      if (!userId) throw new Error('User not authenticated');

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
              ${tasks.data.map(task => `
                <div class="task-item">
                  <h3>${task.description}</h3>
                  <p>Récompense: ${task.reward}</p>
                  <p>Status: ${task.status}</p>
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
            try {
              const taskId = button.dataset.taskId;
              
              const response = await fetch('/api/claim', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Telegram-Data': Telegram.WebApp.initData
                },
                body: JSON.stringify({ userId, taskId })
              });

              if (!response.ok) {
                throw new Error('Failed to claim task');
              }

              const data = await response.json();
              showNotification(data.message || 'Tâche réclamée avec succès!', 'success');
              
              // Rafraîchir la vue des tâches
              await showTasksView();

            } catch (error) {
              console.error('Error claiming task:', error);
              showNotification('Erreur lors de la réclamation de la tâche', 'error');
              throw error; // Propager l'erreur pour la gestion globale
            }
          });
        });

      } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Erreur lors du chargement des tâches', 'error');
        content.innerHTML = `
          <div class="error-container">
            <h2>Error</h2>
            <p>${error.message}</p>
          </div>
        `;
        throw error; // Propager l'erreur pour la gestion globale
      }

    } catch (error) {
      console.error('Error in tasks view setup:', error);
      showNotification('Erreur lors de la configuration de la vue des tâches', 'error');
      throw error; // Propager l'erreur pour la gestion globale
    }

  } catch (error) {
    console.error('Error in showTasksView:', error);
    showNotification('Erreur critique lors de l\'affichage de la vue des tâches', 'error');
    return `
      <div class="error-container">
        <h2>Error</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}

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
          <p>Votre code de parrainage: ${referralInfo.data.referralCode}</p>
          <p>Points gagnés: ${referralInfo.data.pointsEarned}</p>
          <p>Nombre de parrainages: ${referralInfo.data.referralsCount}</p>
          <div class="referrals-list">
            ${referralInfo.data.referrals.map(referral => `
              <div class="referral-item">
                <p>${referral.username} (${referral.date})</p>
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

// Configurer la navigation entre les vues
async function setupNavigation() {
  try {
    // Sélectionner tous les boutons de navigation
    const navButtons = document.querySelectorAll('.nav-button');
    if (!navButtons || navButtons.length === 0) {
      throw new Error('Navigation buttons not found');
    }

    // Ajouter les gestionnaires d'événements
    navButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        try {
          e.preventDefault();
          const viewId = button.dataset.view;
          if (!viewId) {
            throw new Error('View ID not specified');
          }

          // Désactiver tous les boutons actifs
          navButtons.forEach(btn => btn.classList.remove('active'));
          
          // Activer le bouton cliqué
          button.classList.add('active');
          
          // Afficher la vue
          await showView(viewId);
        } catch (error) {
          console.error('Error handling navigation:', error);
          showNotification('Error switching view', 'error');
          
          // Afficher un message d'erreur dans le contenu
          const content = document.getElementById('content');
          if (content) {
            content.innerHTML = `
              <div class="error-message">
                <h3>Erreur de navigation</h3>
                <p>${error.message}</p>
              </div>
            `;
          }
        }
      });
    });
  } catch (error) {
    console.error('Navigation setup error:', error);
    showNotification('Error setting up navigation', 'error');
    
    // Afficher un message d'erreur dans le contenu
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <div class="error-message">
          <h3>Erreur de configuration</h3>
          <p>${error.message}</p>
        </div>
      `;
    }
  }
}

// Fonction principale pour afficher une vue
async function showView(viewId) {
  try {
    // Vérifier le conteneur de contenu
    const content = document.getElementById('content');
    if (!content) throw new Error('Content container not found');

    // Afficher le spinner de chargement
    content.innerHTML = '<div class="loading-spinner"></div>';

    // Afficher la vue appropriée selon l'ID
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
          <h3>Erreur d'affichage</h3>
          <p>${error.message}</p>
        </div>
      `;
    }
  }
}
    // Vérifier le conteneur de contenu
    const content = document.getElementById('content');
    if (!content) throw new Error('Content container not found');

    // Afficher le spinner de chargement
    content.innerHTML = '<div class="loading-spinner"></div>';

    // Afficher la vue appropriée selon l'ID
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
    // Gestion des erreurs
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
  try {
    try {
      const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
      if (!userId) throw new Error('User not authenticated');

      const content = document.getElementById('content');
      if (!content) throw new Error('Content container not found');

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
            <img src="./images/start.png" alt="Start" class="stat-icon" />
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
        const response = await fetch(`/api/user-data?userId=${userId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch mining speed');
        }
        const speedData = await response.json();
        if (speedData.mining_speed) {
          document.getElementById('mining-speed').textContent = 
            `${speedData.mining_speed} token/min`;
        }
      } catch (error) {
        console.error('Error loading mining speed:', error);
        showNotification('Erreur lors du chargement de la vitesse de minage', 'error');
        throw error; // Propager l'erreur pour la gestion globale
      }

      // Configurer l'événement pour le bouton de minage
      const miningBtn = document.getElementById('mining-btn');
      if (miningBtn) {
        miningBtn.addEventListener('click', async () => {
          try {
            if (isMining) {
              stopMining();
            } else {
              await startMining(userId);
            }
          } catch (error) {
            console.error('Error handling mining button:', error);
            showNotification('Erreur lors du minage', 'error');
            throw error; // Propager l'erreur pour la gestion globale
          }
        });
      }

    } catch (error) {
      console.error('Error in mining view setup:', error);
      showNotification('Erreur lors de la configuration de la vue de minage', 'error');
      throw error; // Propager l'erreur pour la gestion globale
    }

  } catch (error) {
    console.error('Error in showClaimView:', error);
    showNotification('Erreur critique lors de l\'affichage de la vue de minage', 'error');
    return `
      <div class="error-container">
        <h2>Error</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
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
      const response = await fetch('/api/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': Telegram.WebApp.initData
        },
        body: JSON.stringify({
          userId: Telegram.WebApp.initDataUnsafe.user.id
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.message || 'Claim failed');
      }

function updateMiningDisplay(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  document.getElementById('mining-time').textContent = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  // Mettre à jour le bouton
  const miningBtn = document.getElementById('mining-btn');
  if (miningBtn) {
    if (seconds >= 30) { // 30 secondes minimum pour claim
      miningBtn.innerHTML = `
        <img src="./images/claim.png" alt="Claim" class="btn-icon" />
        Claim (${Math.floor(seconds/60)}m)
      `;
      miningBtn.classList.add('claim-ready');
    } else {
      miningBtn.textContent = `Mining (${hours}h ${minutes}m ${secs}s)`;
      miningBtn.classList.remove('claim-ready');
    }
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
  if (!miningBtn) {
    console.error('Mining button not found');
    return;
  }

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
          isMining = false;
        }
      }, 1000);
    } else {
      // Arrêter le minage
      isMining = false;
      clearInterval(miningInterval);
      miningBtn.disabled = false;
      
      // Claimer les tokens si au moins 30 secondes ont été minées
      if (secondsMined >= 30) {
        const minutes = Math.floor(secondsMined / 60);
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

        showNotification('Tokens claimed successfully!', 'success');
        secondsMined = 0;
      }
    }
  } catch (error) {
    console.error('Mining error:', error);
    showNotification(error.message, 'error');
    miningBtn.disabled = false;
    isMining = false;
    clearInterval(miningInterval);
  }
}
    }
  } catch (error) {
    console.error('Error in mining action:', error);
    showNotification('Error in mining action', 'error');
    miningBtn.disabled = false;
    isMining = false;
    clearInterval(miningInterval);
  }

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

      showNotification('Tokens claimed successfully!', 'success');
      miningBtn.disabled = false;
      isMining = false;
      secondsMined = 0;
      clearInterval(miningInterval);
    }
  } catch (error) {
    console.error('Mining error:', error);
    showNotification(error.message, 'error');
    miningBtn.disabled = false;
    isMining = false;
    clearInterval(miningInterval);
  }
}



// Vue Tasks
async function showTasksView() {
  try {
    const response = await fetch('/api/tasks');
    const tasks = await response.json();
    
    if (tasks.error || !tasks.length) {
      return `
        <div class="tasks-container">
          <h2 class="section-title">Available Tasks</h2>
          <p class="no-tasks">No tasks available at the moment</p>
        </div>
      `;
    }
    
    const tasksList = tasks.map(task => `
      <div class="task-card">
        <img src="${task.image}" alt="${task.title}" class="task-image" loading="lazy" />
        <div class="task-info">
          <h3 class="task-title">${task.title}</h3>
          <p class="task-reward">Reward: ${task.reward} tokens</p>
          <button class="task-btn" onclick="completeTask('${task.id}')">Complete Task</button>
        </div>
      </div>
    `).join('');
    
    return `
      <div class="tasks-container">
        <h2 class="section-title">Available Tasks</h2>
        <div class="tasks-list">
          ${tasksList}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading tasks:', error);
    showNotification('Failed to load tasks. Please try again later.', 'error');
    return `
      <div class="tasks-container">
        <h2 class="section-title">Available Tasks</h2>
        <p class="error-message">Failed to load tasks. Please try again later.</p>
      </div>
    `;
  }
}

// Vue Referral
async function showReferralView() {
  try {
    const userId = Telegram.WebApp.initData?.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const response = await fetch('/api/referrals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    return `
      <div class="referral-container">
        <h2 class="section-title">Programme de Parrainage</h2>
        <div class="referral-stats">
          <div class="stat-card">
            <span class="stat-label">Votre Code</span>
            <span class="stat-value">${data.referralCode}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Parrainages</span>
            <span class="stat-value">${data.totalReferrals}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Points Gagnés</span>
            <span class="stat-value">${data.totalEarned} points</span>
          </div>
        </div>
        <div class="referral-actions">
          <input type="text" id="referral-link" class="referral-input" value="${data.referralUrl}" readonly>
          <button id="copy-referral" class="action-btn" onclick="copyLink()">
            <i class="fas fa-copy"></i> Copier le lien
          </button>
          <button id="share-referral" class="action-btn" onclick="shareLink()">
            <i class="fas fa-share"></i> Partager
          </button>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading referral info:', error);
    showNotification('Erreur lors du chargement des informations de parrainage', 'error');
    return `
      <div class="error-container">
        <h2>Erreur</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}
            <i class="fas fa-share"></i> Partager
          </button>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading referral info:', error);
    showNotification('Erreur lors du chargement des informations de parrainage', 'error');
    return `
      <div class="error-container">
        <h2>Erreur</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}

// Fonctions utilitaires
function generateDeviceId() {
  return 'device-' + Math.random().toString(36).substr(2, 9);
}

// Fonctions utilitaires
function generateDeviceId() {
  return 'device-' + Math.random().toString(36).substr(2, 9);
}

// Fonctions de notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// Fonctions de partage
function copyLink() {
  const referralLink = document.getElementById('referral-link');
  if (referralLink) {
    referralLink.select();
    document.execCommand('copy');
    showNotification('Lien copié dans le presse-papiers', 'success');
  }
}

function shareLink() {
  const referralLink = document.getElementById('referral-link');
  if (referralLink) {
    const url = referralLink.value;
    if (navigator.share) {
      navigator.share({
        title: 'Airdrop Telegram',
        text: 'Rejoignez notre programme de parrainage!',
        url: url
      }).catch(console.error);
    } else if (window.Telegram && window.Telegram.WebApp) {
      Telegram.WebApp.shareUrl(url);
    } else {
      showNotification('Veuillez copier le lien et le partager manuellement', 'info');
    }
  }
}

// Fonctions de minage
function updateMiningDisplay(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  document.getElementById('mining-time').textContent = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  // Mettre à jour le bouton
  const miningBtn = document.getElementById('mining-btn');
  if (miningBtn) {
    if (seconds >= 30) { // 30 secondes minimum pour claim
      miningBtn.innerHTML = `
        <img src="./images/claim.png" alt="Claim" class="btn-icon" />
        Claim (${Math.floor(seconds/60)}m)
      `;
      miningBtn.classList.add('claim-ready');
    } else {
      miningBtn.textContent = `Mining (${hours}h ${minutes}m ${secs}s)`;
      miningBtn.classList.remove('claim-ready');
    }
  }
}

// Fonctions de tâches
async function completeTask(taskId) {
  try {
    const userId = Telegram.WebApp.initData?.user?.id;
    if (!userId) throw new Error('User not authenticated');

    const response = await fetch('/api/complete-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, taskId })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    showNotification('Task completed successfully!', 'success');
    await showTasksView();
  } catch (error) {
    console.error('Error completing task:', error);
    showNotification('Failed to complete task', 'error');
  }
}

// Fonction d'initialisation
async function initializeApp() {
  try {
    // Vérifier l'authentification Telegram
    if (!Telegram.WebApp.initData) {
      throw new Error('Telegram Web App not initialized');
    }

    // Charger les données utilisateur
    await loadUserData();
    
    // Configurer la navigation
    setupNavigation();
    
    // Afficher la vue par défaut
    await showView('claim');
  } catch (error) {
    console.error('Error initializing app:', error);
    showNotification('Erreur lors de l\'initialisation de l\'application', 'error');
  }
}

// Initialiser l'application au chargement
document.addEventListener('DOMContentLoaded', initializeApp);