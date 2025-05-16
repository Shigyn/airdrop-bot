// Assure que Telegram WebApp API est chargé
const tg = window.Telegram.WebApp;
tg.expand();

// Récupération userId côté client
const userId = tg.initDataUnsafe?.user?.id || null;

if (!userId) {
  alert('Erreur : utilisateur non identifié via Telegram.');
}

// DOM Elements
const navClaim = document.getElementById('btn-claim');
const navTasks = document.getElementById('btn-tasks');
const navReferrals = document.getElementById('btn-referral');

const content = document.getElementById('content');

// Variables claim
let lastClaimTime = null;
const CLAIM_INTERVAL_MS = 60 * 60 * 1000; // 1h
const CLAIM_HALF_INTERVAL_MS = 30 * 60 * 1000; // 30min

// Navigation
function showTasks() {
  content.innerHTML = '<h2>Chargement des tâches...</h2>';
  fetch('/tasks')
    .then(res => res.json())
    .then(tasks => {
      if (!tasks.length) {
        content.innerHTML = '<p>Aucune tâche disponible pour le moment.</p>';
        return;
      }
      let html = '<h2>Tasks disponibles</h2><ul>';
      tasks.forEach(task => {
        html += `<li><b>${task.name}</b>: ${task.description} - Récompense: ${task.reward} points - Status: ${task.completed ? '✅ Complétée' : '❌ Non complétée'}</li>`;
      });
      html += '</ul>';
      content.innerHTML = html;
    })
    .catch(() => {
      content.innerHTML = '<p>Erreur lors du chargement des tâches.</p>';
    });
}

function showClaim() {
  content.innerHTML = `
    <h2>Claim</h2>
    <form id="claimForm">
      <input type="text" name="taskId" placeholder="ID tâche (optionnel)" />
      <button id="claim-button" type="submit">Réclamer</button>
    </form>
    <div id="claimResult"></div>
  `;

  const claimForm = document.getElementById('claimForm');
  const claimButton = document.getElementById('claim-button');
  const claimResult = document.getElementById('claimResult');

  claimForm.onsubmit = async (e) => {
    e.preventDefault();
    claimButton.disabled = true;
    claimButton.classList.add('pulse');
    setTimeout(() => claimButton.classList.remove('pulse'), 600);

    const taskId = claimForm.taskId.value || null;

    try {
      const res = await fetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, taskId }),
      });
      const data = await res.json();
      if (data.success) {
        claimResult.style.color = '#28a745';
        claimResult.textContent = data.message || 'Réclamation réussie !';
      } else {
        claimResult.style.color = 'red';
        claimResult.textContent = data.message || 'Erreur lors de la réclamation.';
      }
    } catch (err) {
      claimResult.style.color = 'red';
      claimResult.textContent = `Erreur réseau: ${err.message}`;
    } finally {
      claimButton.disabled = false;
    }
  };
}

function showReferrals() {
  content.innerHTML = '<h2>Chargement des infos de parrainage...</h2>';
  fetch(`/referral/${userId}`)
    .then(res => res.json())
    .then(data => {
      content.innerHTML = `
        <h2>Referral</h2>
        <p>Code de parrainage : <b>${data.referralCode || 'N/A'}</b></p>
        <p>Nombre de filleuls : <b>${data.referralsCount || 0}</b></p>
        <p>Points gagnés : <b>${data.pointsEarned || 0}</b></p>
        ${data.referrals && data.referrals.length > 0 ? `
          <h3>Filleuls :</h3>
          <ul>
            ${data.referrals.map(r => `<li>UserID: ${r.userId} - Rejoint le ${new Date(r.joinDate).toLocaleDateString()}</li>`).join('')}
          </ul>
        ` : '<p>Aucun filleul pour le moment.</p>'}
      `;
    })
    .catch(() => {
      content.innerHTML = '<p>Erreur lors de la récupération des infos de parrainage.</p>';
    });
}

// Events
navTasks.addEventListener('click', showTasks);
navClaim.addEventListener('click', showClaim);
navReferrals.addEventListener('click', showReferrals);

// Affiche la section claim par défaut
document.addEventListener('DOMContentLoaded', () => {
  showClaim();
});
