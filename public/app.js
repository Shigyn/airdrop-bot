'use strict';

// Variables globales
let miningInterval;
let secondsMined = 0;
let isMining = false;

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  try {
    // Vérifier que Telegram WebApp est initialisé
    if (!window.Telegram || !window.Telegram.WebApp) {
      throw new Error('Please open this app from Telegram');
    }

    // Développer l'application pour utiliser tout l'écran
    Telegram.WebApp.expand();

    // Vérifier l'authentification
    const user = Telegram.WebApp.initDataUnsafe?.user;
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    console.log('User authenticated:', user);

    // Charger les données utilisateur
    await loadUserData();

    // Configurer la navigation
    setupNavigation();

    // Afficher la vue initiale
    await showView('claim');
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification(error.message, 'error');
    
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <div class="error-message">
          <h2>Initialization Error</h2>
          <p>${error.message}</p>
          <p>Please open this app from Telegram.</p>
        </div>
      `;
    }
  }
}

async function loadUserData() {
  try {
    const userId = Telegram.WebApp.initDataUnsafe.user.id;
    console.log('Fetching user data for:', userId);
    
    const response = await fetch('/api/user-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Telegram-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ userId })
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error('Failed to fetch user data: ' + errorText);
    }

    const userData = await response.json();
    console.log('User data received:', userData);
    
    if (!userData || !userData.data) {
      throw new Error('Invalid user data format');
    }

    updateUserUI(userData.data);
    
    return userData.data;
  } catch (error) {
    console.error('Error loading user data:', error);
    showNotification('Failed to load user data: ' + error.message, 'error');
    throw error;
  }
}

function updateUserUI(userData) {
  console.log('Updating UI with:', userData);
  
  const usernameElement = document.getElementById('username');
  const balanceElement = document.getElementById('balance');
  const lastClaimElement = document.getElementById('lastClaim');

  if (usernameElement) {
    usernameElement.textContent = userData.username || 'N/A';
    console.log('Updated username:', usernameElement.textContent);
  } else {
    console.error('Username element not found');
  }

  if (balanceElement) {
    balanceElement.textContent = userData.balance || '0';
    console.log('Updated balance:', balanceElement.textContent);
  } else {
    console.error('Balance element not found');
  }

  if (lastClaimElement) {
    lastClaimElement.textContent = userData.lastClaim 
      ? new Date(userData.lastClaim).toLocaleString() 
      : 'Never claimed';
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const viewId = button.dataset.view;
      
      navButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      await showView(viewId);
    });
  });
}

async function showView(viewId) {
  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = '<div class="loading-spinner"></div>';

  try {
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
    console.error(`Error showing ${viewId} view:`, error);
    content.innerHTML = `<div class="error">Error loading view</div>`;
  }
}

async function showClaimView() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-view">
      <h2>Mining</h2>
      <div class="mining-stats">
        <div id="mining-time">00:00:00</div>
      </div>
      <button id="mining-btn" class="primary-btn">
        ${isMining ? 'Stop Mining' : 'Start Mining'}
      </button>
    </div>
  `;

  document.getElementById('mining-btn').addEventListener('click', toggleMining);
}

async function showTasksView() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="tasks-view">
      <h2>Available Tasks</h2>
      <div class="tasks-list">
        Loading tasks...
      </div>
    </div>
  `;

  try {
    const response = await fetch('/api/tasks');
    const tasks = await response.json();
    
    content.querySelector('.tasks-list').innerHTML = tasks.data.map(task => `
      <div class="task-item">
        <h3>${task.description}</h3>
        <p>Reward: ${task.reward}</p>
        <button class="task-btn" data-task-id="${task.id}">
          Claim Task
        </button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading tasks:', error);
    content.querySelector('.tasks-list').innerHTML = `
      <div class="error">Failed to load tasks</div>
    `;
  }
}

async function showReferralView() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="referral-view">
      <h2>Referral Program</h2>
      <div class="referral-info">
        Loading referral information...
      </div>
    </div>
  `;

  try {
    const userId = Telegram.WebApp.initDataUnsafe.user.id;
    const response = await fetch(`/api/referral?userId=${userId}`);
    const referralData = await response.json();
    
    content.querySelector('.referral-info').innerHTML = `
      <p>Your referral code: ${referralData.data.referralCode}</p>
      <p>Total referrals: ${referralData.data.referralsCount}</p>
      <p>Earned points: ${referralData.data.pointsEarned}</p>
      <button id="copy-referral" class="action-btn">
        Copy Referral Link
      </button>
    `;

    document.getElementById('copy-referral').addEventListener('click', () => {
      navigator.clipboard.writeText(referralData.data.referralUrl);
      showNotification('Referral link copied!', 'success');
    });
  } catch (error) {
    console.error('Error loading referral info:', error);
    content.querySelector('.referral-info').innerHTML = `
      <div class="error">Failed to load referral information</div>
    `;
  }
}

function toggleMining() {
  if (isMining) {
    stopMining();
  } else {
    startMining();
  }
}

function startMining() {
  isMining = true;
  secondsMined = 0;
  updateMiningUI();
  
  miningInterval = setInterval(() => {
    secondsMined++;
    updateMiningUI();
  }, 1000);
}

function stopMining() {
  isMining = false;
  clearInterval(miningInterval);
  updateMiningUI();
}

function updateMiningUI() {
  const miningBtn = document.getElementById('mining-btn');
  const miningTime = document.getElementById('mining-time');
  
  if (miningBtn) {
    miningBtn.textContent = isMining ? 'Stop Mining' : 'Start Mining';
  }
  
  if (miningTime) {
    const hours = Math.floor(secondsMined / 3600);
    const minutes = Math.floor((secondsMined % 3600) / 60);
    const seconds = secondsMined % 60;
    miningTime.textContent = 
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}