const ReferralPage = {
  showReferralPage: async function() {
    const content = document.getElementById('content');
    if (!content) return;

    // Template amélioré avec état de chargement
    content.innerHTML = `
      <div class="referral-container">
        <h2><i class="fas fa-user-plus"></i> Programme de Parrainage</h2>
        
        <div class="referral-card">
          <div class="input-group">
            <input type="text" id="referral-link" readonly value="Génération du lien...">
            <button id="copy-btn" class="btn-copy">
              <i class="far fa-copy"></i> Copier
            </button>
          </div>
          <p class="info-text">Vous gagnez 10% des tokens de vos filleuls</p>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <i class="fas fa-users"></i>
            <span id="ref-count">0</span>
            <span>Filleuls</span>
          </div>
          <div class="stat-card">
            <i class="fas fa-coins"></i>
            <span id="ref-earnings">0</span>
            <span>Tokens gagnés</span>
          </div>
        </div>

        <h3><i class="fas fa-list"></i> Vos filleuls</h3>
        <div id="ref-list" class="referral-list">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;

    try {
      const tg = window.Telegram.WebApp;
      const user = tg.initDataUnsafe.user;
      if (!user?.id) throw new Error("Utilisateur non identifié");

      // Génération du lien avec parrain_id
      const referralLink = `https://t.me/CRYPTORATS_bot?start=parrain_${user.id}`;
      document.getElementById('referral-link').value = referralLink;

      // Configuration du bouton copie
      document.getElementById('copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(referralLink);
        const copyBtn = document.getElementById('copy-btn');
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copié!';
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="far fa-copy"></i> Copier';
        }, 2000);
      });

      // Récupération des données des filleuls
      const response = await fetch(`/api/referrals?user_id=${user.id}`);
      if (!response.ok) throw new Error("Erreur serveur");

      const data = await response.json();
      
      // Mise à jour de l'interface
      this.updateReferralUI({
        count: data.referral_count || 0,
        earnings: data.earned_tokens || 0,
        referrals: data.referrals || []
      });

    } catch (error) {
      console.error("Referral error:", error);
      this.showError(error.message);
    }
  },

  updateReferralUI: function(data) {
    document.getElementById('ref-count').textContent = data.count;
    document.getElementById('ref-earnings').textContent = data.earnings;

    const listElement = document.getElementById('ref-list');
    if (listElement) {
      listElement.innerHTML = data.referrals.length > 0
        ? data.referrals.map(ref => `
            <div class="referral-item">
              <div class="user-info">
                <i class="fas fa-user"></i>
                <span>${ref.username || 'Anonyme'}</span>
              </div>
              <div class="referral-details">
                <span class="date">${new Date(ref.date).toLocaleDateString('fr-FR')}</span>
                <span class="reward">+${ref.reward} tokens</span>
              </div>
            </div>
          `).join('')
        : `<div class="empty-state">
             <i class="fas fa-user-slash"></i>
             <p>Aucun filleul actif</p>
           </div>`;
    }
  },

  showError: function(message) {
    const listElement = document.getElementById('ref-list') || document.getElementById('content');
    if (listElement) {
      listElement.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>${message}</p>
          <button onclick="ReferralPage.showReferralPage()" class="retry-btn">
            <i class="fas fa-sync-alt"></i> Réessayer
          </button>
        </div>
      `;
    }
  }
};