'use strict';

// Variables globales
let miningInterval;
let secondsMined = 0;
let isMining = false;

// Fonctions utilitaires
function showNotification(message, type = 'info') {
  try {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  } catch (error) {
    console.error('Error showing notification:', error);
  }
}

// Fonctions de données utilisateur
async function loadUserData() {
  try {
    console.log('[loadUserData] Starting to load user data...');
    
    // 1. Vérification initiale des données Telegram
    if (!window.Telegram || !Telegram.WebApp || !Telegram.WebApp.initData) {
      throw new Error('Telegram WebApp SDK not properly loaded');
    }

    const initData = Telegram.WebApp.initData;
    console.log('[loadUserData] Telegram initData:', initData);

    // 2. Extraction de l'ID utilisateur
    const userId = initData.user?.id;
    if (!userId) {
      throw new Error('User ID not found in Telegram data');
    }
    console.log('[loadUserData] User ID:', userId);

    // 3. Vérification des éléments DOM critiques
    const requiredElements = {
      username: document.getElementById('username'),
      balance: document.getElementById('balance'),
      miningBtn: document.getElementById('mining-btn'),
      miningTime: document.getElementById('mining-time')
    };

    console.log('[loadUserData] Checking DOM elements:', requiredElements);

    for (const [name, element] of Object.entries(requiredElements)) {
      if (!element) {
        throw new Error(`Required element not found: ${name}`);
      }
    }

    // 4. Préparation de la requête API
    const apiUrl = '/api/user-data';
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': JSON.stringify(initData)
      },
      body: JSON.stringify({ userId })
    };

    console.log('[loadUserData] Making API request to:', apiUrl, requestOptions);

    // 5. Exécution de la requête
    const response = await fetch(apiUrl, requestOptions);
    console.log('[loadUserData] API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[loadUserData] API error response:', errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[loadUserData] API response data:', result);

    // 6. Validation des données reçues
    if (!result || !result.success || !result.data) {
      throw new Error('Invalid API response format');
    }

    const userData = result.data;
    console.log('[loadUserData] Received user data:', userData);

    // 7. Mise à jour de l'interface utilisateur
    try {
      requiredElements.username.textContent = userData.username || 'User';
      requiredElements.balance.textContent = userData.balance?.toString() || '0';
      
      console.log('[loadUserData] UI updated successfully');
    } catch (uiError) {
      console.error('[loadUserData] UI update error:', uiError);
      throw new Error('Failed to update UI elements');
    }

    // 8. Retour des données utilisateur
    return {
      id: userId,
      username: userData.username || `user_${userId}`,
      balance: parseFloat(userData.balance) || 0,
      lastClaim: userData.lastClaim || null,
      rawData: userData // Conserve toutes les données originales
    };

  } catch (error) {
    console.error('[loadUserData] Critical error:', error);
    
    // Fallback UI update
    try {
      const usernameEl = document.getElementById('username');
      const balanceEl = document.getElementById('balance');
      
      if (usernameEl) usernameEl.textContent = 'User';
      if (balanceEl) balanceEl.textContent = '0';
    } catch (fallbackError) {
      console.error('[loadUserData] Fallback UI update failed:', fallbackError);
    }

    // Envoyer une notification d'erreur claire
    showNotification(
      'Erreur de chargement des données. Veuillez rafraîchir la page.', 
      'error'
    );

    // Retourner des données par défaut pour permettre au reste de l'application de fonctionner
    const fallbackUserId = Telegram.WebApp.initData?.user?.id || '0';
    return {
      id: fallbackUserId,
      username: `user_${fallbackUserId}`,
      balance: 0,
      lastClaim: null,
      error: error.message
    };
  }
}

// Fonctions de minage
function startMining() {
  try {
    const userId = Telegram.WebApp.initData.user?.id;
    if (!userId) throw new Error('User not authenticated');

    const miningBtn = document.getElementById('mining-btn');
    if (!miningBtn) throw new Error('Mining button not found');

    miningBtn.innerHTML = `
      <img src="./images/stop.png" alt="Stop" class="btn-icon" />
      Stop Mining
    `;
    miningBtn.classList.add('active');

    const miningAnimation = document.getElementById('mining-animation');
    if (miningAnimation) miningAnimation.classList.add('active');

    miningInterval = setInterval(() => {
      secondsMined++;
      updateMiningDisplay(secondsMined);
    }, 1000);

    isMining = true;
  } catch (error) {
    console.error('Error starting mining:', error);
    showNotification('Erreur lors du démarrage du minage', 'error');
  }
}

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

    const miningAnimation = document.getElementById('mining-animation');
    if (miningAnimation) miningAnimation.classList.remove('active');

    clearInterval(miningInterval);
    isMining = false;
  } catch (error) {
    console.error('Error stopping mining:', error);
    showNotification('Erreur lors de l\'arrêt du minage', 'error');
  }
}

function updateMiningDisplay(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  document.getElementById('mining-time').textContent = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  const miningBtn = document.getElementById('mining-btn');
  if (miningBtn) {
    if (seconds >= 30) {
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

// Fonctions de navigation
function setupNavigation() {
  try {
    const navButtons = document.querySelectorAll('.nav-btn');
    if (!navButtons || navButtons.length === 0) {
      throw new Error('No navigation buttons found');
    }

    navButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        const viewId = button.dataset.view;
        if (!viewId) {
          console.error('Navigation button missing view ID');
          return;
        }

        // Vérifier si la vue existe
        const viewElement = document.getElementById(viewId);
        if (!viewElement) {
          console.error(`View element not found: ${viewId}`);
          showNotification(`Page non trouvée: ${viewId}`, 'error');
          return;
        }

        // Gérer la navigation
        navButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Masquer toutes les vues
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        
        // Afficher la vue sélectionnée
        viewElement.classList.add('active');
      });
    });
  } catch (error) {
    console.error('Error setting up navigation:', error);
    showNotification('Erreur lors de la configuration de la navigation', 'error');
  }
}

// Fonction principale d'initialisation
async function initializeApp() {
  try {
    // Vérifiez que Telegram.WebApp est disponible
    if (!window.Telegram || !Telegram.WebApp || !Telegram.WebApp.initData) {
      throw new Error('Telegram WebApp SDK not properly loaded');
    }

    // Attendez que le DOM soit complètement chargé
    if (document.readyState !== 'complete') {
      await new Promise(resolve => {
        window.addEventListener('load', resolve);
      });
    }

    await loadUserData();
    setupNavigation();
    
    // Gestion des erreurs pour showView
    try {
      await showView('claim');
    } catch (error) {
      console.error('Error showing initial view:', error);
      showNotification('Failed to load initial view', 'error');
    }
  } catch (error) {
    console.error('Error initializing app:', error);
    showNotification('Erreur lors de l\'initialisation: ' + error.message, 'error');
    
    // Solution de repli - charger au moins la vue de base
    const defaultView = document.getElementById('claim');
    if (defaultView) defaultView.classList.add('active');
  }
}

// Initialiser l'application au chargement
document.addEventListener('DOMContentLoaded', initializeApp);
