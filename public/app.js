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
    // Récupérer l'ID de l'utilisateur Telegram
    const userId = Telegram.WebApp.initDataUnsafe.user.id;
    console.log('Loading data for user:', userId);

    // Appeler l'API pour obtenir les données utilisateur
    const response = await fetch('/api/user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to load user data');
    }

    const data = await response.json();
    console.log('User data:', data);

    // Mettre à jour l'UI avec les données
    const username = document.getElementById('username');
    const balance = document.getElementById('balance');
    const lastClaim = document.getElementById('lastClaim');

    if (username) username.textContent = data.username || 'User';
    if (balance) balance.textContent = data.balance || '0';
    if (lastClaim) lastClaim.textContent = data.lastClaim || 'Never claimed';

    return data;
  } catch (error) {
    console.error('Error loading user data:', error);
    showNotification('Error loading user data: ' + error.message, 'error');
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
    navButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        const viewId = button.dataset.view;
        
        // Gérer la navigation
        navButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        await showView(viewId);
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
