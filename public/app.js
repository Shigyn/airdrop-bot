// Variables globales
let tg, userId;

function initTelegramWebApp() {
  // Debug
  console.log('Telegram WebApp Debug:', {
    SDKLoaded: !!window.Telegram,
    WebAppReady: !!window.Telegram?.WebApp,
    UserAgent: navigator.userAgent,
    InitData: window.Telegram?.WebApp?.initDataUnsafe
  });

  if (!window.Telegram) {
    throw new Error("SDK Telegram non détecté. Vérifiez le chargement du script.");
  }

  if (!window.Telegram.WebApp) {
    throw new Error("Ouvrez cette application via Telegram (bouton webapp)");
  }

  tg = window.Telegram.WebApp;
  tg.expand();
  tg.enableClosingConfirmation();
  
  userId = tg.initDataUnsafe?.user?.id;
  if (!userId) {
    throw new Error("Utilisateur non identifié via Telegram");
  }

  console.log("WebApp initialisée. UserID:", userId);
}

function initUI() {
  // DOM Elements
  const navClaim = document.getElementById('btn-claim');
  const navTasks = document.getElementById('btn-tasks');
  const navReferrals = document.getElementById('btn-referral');
  const content = document.getElementById('content');

  // Charger les données utilisateur
  loadUserData();

  // Navigation
  navTasks.addEventListener('click', showTasks);
  navClaim.addEventListener('click', showClaim);
  navReferrals.addEventListener('click', showReferrals);

  // Afficher la vue par défaut
  showClaim();
}

function loadUserData() {
  let currentUsername = tg?.initDataUnsafe?.user?.username || "inconnu";
  console.log("Username détecté via Telegram :", currentUsername);

  fetch(`https://script.google.com/macros/s/AKfycbyE6Oeh3BEGIiW9dbsnqg0eh4bcwHNoZZfF2QP_O4_VkQLOLt2wc98VqqDbuzZTqaF9PQ/exec?username=${encodeURIComponent(currentUsername)}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      
      document.getElementById('username').textContent = data.username || "—";
      document.getElementById('balance').textContent = data.balance ?? "--";
      document.getElementById('lastClaim').textContent = data.lastClaim
        ? new Date(data.lastClaim).toLocaleString('fr-FR')
        : "--";
    })
    .catch(err => {
      console.error("Erreur Sheets:", err);
      document.getElementById('username').textContent = "Erreur";
    });
}

function showTasks() {
  const content = document.getElementById('content');
  content.innerHTML = '<h2>Chargement des tâches...</h2>';
  
  fetch('/tasks')
    .then(res => res.json())
    .then(tasks => {
      content.innerHTML = tasks.length 
        ? `<h2>Tâches disponibles</h2><ul>${
            tasks.map(task => `
              <li>
                <b>${task.id}</b>: ${task.description} - 
                Récompense: ${task.reward} - 
                Statut: ${task.completed ? '✅' : '❌'}
              </li>`
            ).join('')
          }</ul>`
        : '<p>Aucune tâche disponible</p>';
    })
    .catch(() => {
      content.innerHTML = '<p>Erreur de chargement</p>';
    });
}

async function claimSpecificTask(userId, taskId) {
  const res = await fetch('/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, taskId })
  });
  const data = await res.json();
  console.log(data);
  return data; // tu peux gérer ça ailleurs
}

async function claimRandomTask(userId) {
  const res = await fetch('/claim/random', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  const data = await res.json();
  console.log(data);
  return data;
}

function showClaim() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="claim-container">
      <h2>Claim</h2>
      
      <div class="claim-options">
        <!-- Option 1: Claim rapide (tâche aléatoire) -->
        <button id="quick-claim" class="claim-button">
          Claim Rapide (Tâche Aléatoire)
        </button>
        
        <div class="or-separator">OU</div>
        
        <!-- Option 2: Claim avec ID spécifique -->
        <div class="specific-claim">
          <input 
            type="text" 
            id="specific-task-id" 
            placeholder="ID tâche (optionnel)" 
            aria-label="ID de la tâche"
          />
          <button id="specific-claim" class="claim-button">
            Claim Spécifique
          </button>
        </div>
      </div>
      
      <div id="claimResult" class="claim-result"></div>
    </div>
  `;

  // Gestion du claim rapide
  document.getElementById('quick-claim').addEventListener('click', async () => {
    await processClaim(null);
  });

  // Gestion du claim spécifique
  document.getElementById('specific-claim').addEventListener('click', async () => {
    const taskId = document.getElementById('specific-task-id').value.trim() || null;
    await processClaim(taskId);
  });

  async function processClaim(taskId) {
    const resultDiv = document.getElementById('claimResult');
    resultDiv.innerHTML = '<div class="loading-spinner"></div>';
    resultDiv.className = 'claim-result loading';

    try {
      const response = await fetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, taskId })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Erreur inconnue');

      resultDiv.className = 'claim-result success';
      resultDiv.innerHTML = `
        ✅ <strong>${data.message || 'Succès!'}</strong>
        ${data.taskId ? `<p>ID Tâche: ${data.taskId}</p>` : ''}
        ${data.reward ? `<p>Récompense: ${data.reward}</p>` : ''}
      `;

      // Rafraîchir les données utilisateur
      loadUserData();

    } catch (error) {
      resultDiv.className = 'claim-result error';
      resultDiv.innerHTML = `❌ <strong>Erreur:</strong> ${error.message}`;
      console.error('Claim Error:', error);
    }
  }
}

function showReferrals() {
  const content = document.getElementById('content');
  content.innerHTML = '<h2>Chargement...</h2>';
  
  fetch(`/referral/${userId}`)
    .then(res => res.json())
    .then(data => {
      content.innerHTML = `
        <h2>Parrainage</h2>
        <p>Votre code: <b>${data.referralCode || 'N/A'}</b></p>
        <p>Filleuls: <b>${data.referralsCount || 0}</b></p>
        <p>Points: <b>${data.pointsEarned || 0}</b></p>
        ${data.referrals?.length ? `
          <h3>Liste:</h3>
          <ul>${data.referrals.map(r => `
            <li>${r.userId} (${new Date(r.joinDate).toLocaleDateString()})</li>
          `).join('')}</ul>
        ` : ''}
      `;
    })
    .catch(() => {
      content.innerHTML = '<p>Erreur de chargement</p>';
    });
}

function showNotification(message, type = 'success') {
  const notif = document.getElementById('notification');
  notif.textContent = message;
  notif.className = `notification ${type}`;
  
  setTimeout(() => {
    notif.classList.add('hidden');
  }, 5000);
}

// Utilisation :
// showNotification("Tâche réclamée avec succès!", "success");
// showNotification("Aucune tâche disponible", "warning");

// Point d'entrée principal
document.addEventListener('DOMContentLoaded', () => {
  try {
    initTelegramWebApp();
    initUI();
  } catch (error) {
    console.error("Erreur d'initialisation:", error);
    document.body.innerHTML = `
      <div class="container">
        <h1>Erreur</h1>
        <p style="color: red">${error.message}</p>
        <p>Ouvrez cette application via Telegram</p>
      </div>
    `;
  }
});