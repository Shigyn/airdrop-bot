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
    const initData = await Telegram.WebApp.init();
    const userId = initData.user.id;
    console.log('Loading data for user:', userId);

    // Vérifier que l'ID utilisateur existe
    if (!userId) {
      throw new Error('User ID not found in Telegram data');
    }

    // Vérifier que les éléments DOM existent
    const usernameElement = document.getElementById('username');
    const balanceElement = document.getElementById('balance');
    
    if (!usernameElement || !balanceElement) {
      console.error('DOM elements not found:', {
        username: !!usernameElement, 
        balance: !!balanceElement
      });
      throw new Error('UI elements not found');
    }

    // Appeler l'API avec les bons headers
    const response = await fetch('/api/user-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ userId })
    });

    console.log('API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error response:', errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('API response data:', result);

    // Vérifier la structure des données
    if (!result || !result.data) {
      throw new Error('Invalid data format from API');
    }

    const userData = result.data;
    
    // Mettre à jour l'UI avec vérification
    if (usernameElement) {
      usernameElement.textContent = userData.username || 'User';
      console.log('Username set:', usernameElement.textContent);
    }
    
    if (balanceElement) {
      balanceElement.textContent = userData.balance || '0';
      console.log('Balance set:', balanceElement.textContent);
    }

    return userData;
  } catch (error) {
    console.error('Error in loadUserData:', error);
    showNotification('Failed to load user data: ' + error.message, 'error');
    
    // Mettre des valeurs par défaut en cas d'erreur
    const usernameElement = document.getElementById('username');
    const balanceElement = document.getElementById('balance');
    if (usernameElement) usernameElement.textContent = 'User';
    if (balanceElement) balanceElement.textContent = '0';
    
    throw error;
  }
}

// Fonctions de minage
function startMining() {
  try {
    const userId = Telegram.WebApp.initData?.user?.id;
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
    if (!Telegram.WebApp.initData) {
      throw new Error('Telegram Web App not initialized');
    }

    await loadUserData();
    setupNavigation();
    await showView('claim');
  } catch (error) {
    console.error('Error initializing app:', error);
    showNotification('Erreur lors de l\'initialisation de l\'application', 'error');
  }
}

// Initialiser l'application au chargement
document.addEventListener('DOMContentLoaded', initializeApp);
