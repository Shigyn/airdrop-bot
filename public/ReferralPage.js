const ReferralPage = {
  showReferralPage: async function() {
    const content = document.getElementById('content');
    if (!content) return;

    // Afficher le loader immédiatement
    content.innerHTML = `
      <div class="referral-container">
        <h2><i class="fas fa-user-plus"></i> Programme de Parrainage</h2>
        
        <div class="referral-card">
          <div class="input-group">
            <input type="text" id="referral-link" readonly value="Chargement...">
            <button id="copy-btn" class="btn-copy" disabled>
              <i class="far fa-copy"></i> Copier
            </button>
          </div>
          <p class="info-text">Vous gagnez 10% des tokens de vos filleuls</p>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <i class="fas fa-users"></i>
            <span id="ref-count">-</span>
            <span>Filleuls</span>
          </div>
          <div class="stat-card">
            <i class="fas fa-coins"></i>
            <span id="ref-earnings">-</span>
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
      const tg = window.Telegram?.WebApp;
      const userId = tg?.initDataUnsafe?.user?.id;
      
      if (!userId) {
        throw new Error("Vous devez être connecté via Telegram");
      }

      // 1. Générer le lien de parrainage
      const referralLink = `https://t.me/CRYPTORATS_bot?start=ref_${userId}`;
      const linkInput = document.getElementById('referral-link');
      if (linkInput) {
        linkInput.value = referralLink;
      }

      // 2. Activer le bouton copie
      const copyBtn = document.getElementById('copy-btn');
      if (copyBtn) {
        copyBtn.disabled = false;
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(referralLink).then(() => {
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copié!';
            setTimeout(() => {
              copyBtn.innerHTML = '<i class="far fa-copy"></i> Copier';
            }, 2000);
          });
        });
      }

      // 3. Charger les données des filleuls
      const response = await fetch(`/api/referrals?user_id=${userId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': tg?.initData || '',
          'User-ID': userId
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erreur lors du chargement");
      }

      const data = await response.json();
      
      // 4. Vérifier et formater les données
      const formattedData = {
        count: data.referral_count || 0,
        earnings: data.earned_tokens || 0,
        referrals: Array.isArray(data.referrals) 
          ? data.referrals.map(ref => ({
              username: ref.username || 'Anonyme',
              amount: parseFloat(ref.amount) || 0,
              date: ref.date || new Date().toISOString()
            }))
          : []
      };

      // 5. Mettre à jour l'interface
      this.updateReferralUI(formattedData);

    } catch (error) {
      console.error("Referral Error:", error);
      this.showError(error.message || "Une erreur est survenue");
    }
  },

  updateReferralUI: function(data) {
    // Mettre à jour les statistiques
    const refCount = document.getElementById('ref-count');
    const refEarnings = document.getElementById('ref-earnings');
    
    if (refCount) refCount.textContent = data.count;
    if (refEarnings) refCount.textContent = data.earnings.toFixed(2);

    // Mettre à jour la liste
    const listElement = document.getElementById('ref-list');
    if (!listElement) return;

    if (data.referrals.length === 0) {
      listElement.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-user-slash"></i>
          <p>Aucun filleul actif</p>
        </div>
      `;
      return;
    }

    listElement.innerHTML = data.referrals.map(ref => `
      <div class="referral-item">
        <div class="user-info">
          <i class="fas fa-user"></i>
          <span>${ref.username}</span>
        </div>
        <div class="referral-details">
          <span class="date">${new Date(ref.date).toLocaleDateString('fr-FR')}</span>
          <span class="reward">+${ref.amount.toFixed(2)} tokens</span>
        </div>
      </div>
    `).join('');
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