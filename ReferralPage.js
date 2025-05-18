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
      // Charger les données de parrainage
      const response = await fetch('/get-referrals');
      if (!response.ok) throw new Error('Erreur API');
      const data = await response.json();

      // Mettre à jour l'UI
      document.getElementById('referral-link').value = 
        `https://t.me/${tg.initDataUnsafe.user?.username || 'your_bot'}?start=ref-${userId.slice(0, 8)}`;
      
      document.getElementById('referral-count').textContent = data.referralsCount || 0;
      document.getElementById('referral-earnings').textContent = data.earnedTokens || 0;

      // Remplir la liste des filleuls
      const listContainer = document.getElementById('referral-list');
      if (data.referrals && data.referrals.length > 0) {
        listContainer.innerHTML = data.referrals.map(ref => `
          <div class="referral-item">
            <span>${ref.username || 'Utilisateur'} - ${new Date(ref.date).toLocaleDateString('fr-FR')}</span>
            <span class="reward-badge">+${ref.reward} tokens</span>
          </div>
        `).join('');
      } else {
        listContainer.innerHTML = '<p class="no-referrals">Aucun filleul pour le moment</p>';
      }

      // Gestion du bouton de copie
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
          Erreur de chargement. Veuillez réessayer.
        </div>
      `;
    }
  }
};

window.ReferralPage = ReferralPage;