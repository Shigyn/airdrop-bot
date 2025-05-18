const ReferralPage = {
  showReferralPage: async function() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="referral-container">
        <h2>👥 Programme de Parrainage</h2>
        
        <div class="referral-card">
          <h3>Votre lien unique</h3>
          <div class="referral-link-container">
            <input type="text" id="referral-link" readonly value="Chargement...">
            <button id="copy-referral-btn" class="copy-button">
              <span class="copy-icon">⎘</span>
            </button>
          </div>
          <p class="small-text">Partagez ce lien pour gagner des bonus</p>
        </div>

        <div class="stats-container">
          <div class="stat-card">
            <span class="stat-value" id="referral-count">0</span>
            <span class="stat-label">Filleuls</span>
          </div>
          <div class="stat-card">
            <span class="stat-value" id="referral-earnings">0</span>
            <span class="stat-label">Tokens gagnés</span>
          </div>
        </div>

        <div id="referral-list" class="referral-list">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;

    try {
      // Vérification que Telegram WebApp est bien initialisé
      if (!window.Telegram?.WebApp?.initData) {
        throw new Error("L'application n'est pas chargée via Telegram");
      }

      const response = await fetch('/get-referrals', {
        headers: {
          'Telegram-Data': window.Telegram.WebApp.initData,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erreur API');
      }

      const data = await response.json();
      
      // Debug: Afficher les données reçues dans la console
      console.log("Données reçues:", data);

      if (!data) throw new Error('Aucune donnée reçue');

      const user = window.Telegram.WebApp.initDataUnsafe.user;
      const referralLink = `https://t.me/${user?.username || 'your_bot'}?start=ref_${user?.id}`;
      
      // Mise à jour de l'UI
      document.getElementById('referral-link').value = referralLink;
      document.getElementById('referral-count').textContent = data.referralCount ?? 0;
      document.getElementById('referral-earnings').textContent = data.earnedTokens ?? 0;

      // Remplissage de la liste
      const listContainer = document.getElementById('referral-list');
      if (data.referrals?.length > 0) {
        listContainer.innerHTML = data.referrals.map(ref => `
          <div class="referral-item">
            <span>${ref.username || 'Utilisateur'} - ${new Date(ref.date).toLocaleDateString('fr-FR')}</span>
            <span class="reward-badge">+${ref.reward} tokens</span>
          </div>
        `).join('');
      } else {
        listContainer.innerHTML = '<p class="no-referrals">Aucun filleul pour le moment</p>';
      }

      // Gestion du bouton copie
      document.getElementById('copy-referral-btn').addEventListener('click', () => {
        const linkInput = document.getElementById('referral-link');
        linkInput.select();
        document.execCommand('copy');
        
        // Feedback visuel
        const btn = document.getElementById('copy-referral-btn');
        btn.innerHTML = '<span class="copy-icon">✓</span>';
        setTimeout(() => {
          btn.innerHTML = '<span class="copy-icon">⎘</span>';
        }, 2000);
      });

    } catch (error) {
      console.error("Erreur Referral:", error);
      document.getElementById('referral-list').innerHTML = `
        <div class="error-message">
          ${error.message || 'Erreur de chargement'}
          <button onclick="ReferralPage.showReferralPage()" class="retry-button">Réessayer</button>
        </div>
      `;
    }
  }
};

window.ReferralPage = ReferralPage;