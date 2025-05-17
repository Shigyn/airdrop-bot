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
      <h2>Claim Airdrop</h2>
      <div class="timer-display">
        <span id="minutes">0</span> minutes (min. 10)
      </div>
      <button id="claim-btn" class="claim-button">
        <div class="progress-bar" id="progress-bar"></div>
        <span>START CLAIM</span>
      </button>
      <div id="claim-result"></div>
    </div>
  `;

  let timer;
  let minutes = 0;
  const maxMinutes = 60;
  const btn = document.getElementById('claim-btn');
  const progressBar = document.getElementById('progress-bar');
  const minutesDisplay = document.getElementById('minutes');
  const tg = window.Telegram.WebApp;

  btn.addEventListener('click', async function() {
    if (btn.classList.contains('active')) {
      // Envoi du claim
      clearInterval(timer);
      
      if (minutes < 10) {
        document.getElementById('claim-result').innerHTML = `
          <div class="result-message error">
            ❌ Minimum 10 minutes requis
          </div>
        `;
        btn.classList.remove('active');
        minutes = 0;
        updateProgress();
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span>Processing...</span>';

      try {
        const res = await fetch('/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId: tg.initDataUnsafe.user.id,
            username: tg.initDataUnsafe.user.username,
            minutes 
          })
        });
        
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.message);
        
        document.getElementById('claim-result').innerHTML = `
          <div class="result-message success">
            ✅ ${data.message}<br>
            <small>Balance mise à jour</small>
          </div>
        `;
        
        // Rafraîchir les données utilisateur
        loadUserData();
        
      } catch (error) {
        document.getElementById('claim-result').innerHTML = `
          <div class="result-message error">
            ❌ ${error.message}
          </div>
        `;
      } finally {
        btn.classList.remove('active');
        btn.disabled = false;
        btn.innerHTML = '<span>START CLAIM</span>';
        minutes = 0;
        updateProgress();
      }
    } else {
      // Démarrage du timer
      btn.classList.add('active');
      minutes = 0;
      updateProgress();
      
      timer = setInterval(() => {
        if (minutes < maxMinutes) {
          minutes++;
          updateProgress();
        }
      }, 60000); // 1 minute
    }
  });

  function updateProgress() {
    minutesDisplay.textContent = minutes;
    const percentage = Math.min(100, (minutes / maxMinutes) * 100);
    progressBar.style.width = `${percentage}%`;
    progressBar.style.backgroundColor = `hsl(${percentage * 1.2}, 100%, 50%)`;
    
    if (minutes >= 10) {
      btn.querySelector('span').textContent = `CLAIM ${minutes} POINTS`;
    }
  }
}

  function updateProgress() {
    minutesDisplay.textContent = minutes;
    const percentage = Math.min(100, (minutes / maxMinutes) * 100);
    progressBar.style.width = `${percentage}%`;
    progressBar.style.backgroundColor = `hsl(${percentage * 1.2}, 100%, 50%)`;
    
    if (minutes >= 10) {
      btn.querySelector('span').textContent = `CLAIM ${minutes} POINTS`;
    }
  }
}

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