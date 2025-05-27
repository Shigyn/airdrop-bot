'use strict';

// Variables globales
let miningInterval;
let secondsMined = 0;
let isMining = false;
let miningSpeed = 0; // Nouvelle variable pour la vitesse de minage (exemple)

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

// Fonction pour envoyer les données au dashboard (exemple d'implémentation)
function sendDataToDashboard(data) {
  try {
    // Exemple : si tu as un élément dashboard spécifique, on met à jour ses enfants
    const dashboardUsername = document.getElementById('dashboard-username');
    const dashboardBalance = document.getElementById('dashboard-balance');
    const dashboardSpeed = document.getElementById('dashboard-speed');

    if (dashboardUsername) dashboardUsername.textContent = data.username;
    if (dashboardBalance) dashboardBalance.textContent = data.balance.toFixed(2);
    if (dashboardSpeed) dashboardSpeed.textContent = `${data.miningSpeed.toFixed(2)} units/min`;

    // Si tu as une API ou websocket pour envoyer, fais-le ici
    // ex: websocket.send(JSON.stringify(data));
  } catch (error) {
    console.error('Error sending data to dashboard:', error);
  }
}

// Fonctions de données utilisateur
async function loadUserData() {
  try {
    const initData = window.Telegram.WebApp.initDataUnsafe || {};
    const userId = initData.user?.id;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const response = await fetch('/api/user-data', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Telegram-Data': JSON.stringify(initData)
      },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Erreur HTTP ' + response.status);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Données utilisateur invalides');
    }

    // Mise à jour de l'interface
    document.getElementById('user-balance').innerText = data.data.balance || '0';
    document.getElementById('username').innerText = data.data.username || 'Utilisateur';
    
    // Afficher les éléments cachés
    document.getElementById('claim-button').style.display = 'block';
    document.getElementById('mining-counter').style.display = 'block';

    return data.data;
  } catch (error) {
    console.error('Erreur de chargement des données:', error);
    document.getElementById('error-message').textContent = 'Erreur de chargement des données. Veuillez rafraîchir la page.';
    document.getElementById('error-message').style.display = 'block';
    throw error;
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
    // Vérification plus robuste de Telegram WebApp
    if (!window.Telegram?.WebApp) {
      throw new Error('Telegram WebApp SDK not loaded');
    }

    // Initialiser WebApp
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();

    // Attendre que le DOM soit prêt
    if (document.readyState !== 'complete') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
        window.addEventListener('load', resolve);
      });
    }

    // Charger les données utilisateur
    const userData = await loadUserData();
    
    // Initialiser l'interface
    setupNavigation();
    
    // Afficher la vue par défaut
    const defaultView = document.getElementById('dashboard');
    if (defaultView) defaultView.classList.add('active');

    // Démarrer les écouteurs d'événements
    setupEventListeners();

  } catch (error) {
    console.error('Initialization error:', error);
    
    // Afficher un message d'erreur convivial
    const errorElement = document.getElementById('app-error') || document.createElement('div');
    errorElement.id = 'app-error';
    errorElement.style.color = 'red';
    errorElement.style.padding = '1rem';
    errorElement.textContent = 'Erreur de chargement de l\'application. Veuillez rafraîchir ou réessayer plus tard.';
    
    if (!document.getElementById('app-error')) {
      document.body.prepend(errorElement);
    }
    
    // Forcer l'affichage de la vue de base en cas d'erreur
    const views = document.querySelectorAll('.view');
    if (views.length > 0) views[0].classList.add('active');
  }
}

// Initialiser l'application au chargement
document.addEventListener('DOMContentLoaded', initializeApp);
