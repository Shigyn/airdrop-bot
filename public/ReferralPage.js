const ReferralPage = {
  showReferralPage: async function() {
    // Vérifications initiales renforcées
    const content = document.getElementById('content');
    if (!content) {
      console.error("Element 'content' introuvable");
      return;
    }

    if (!window.Telegram?.WebApp) {
      content.innerHTML = `<div class="error-message">Ouvrez via Telegram</div>`;
      return;
    }

    // Template complet avec loading state
    content.innerHTML = `
      <div class="referral-container">
        <h2>👥 Programme de Parrainage</h2>
        
        <div class="referral-card">
          <h3>Votre lien unique</h3>
          <div class="referral-link-container">
            <input type="text" id="referral-link" readonly class="referral-input" value="Génération en cours...">
            <button id="copy-referral-btn" class="copy-button" disabled>
              <span class="copy-icon">⎘</span>
              <span class="copy-text">Copier</span>
            </button>
          </div>
          <p class="small-text">Partagez pour gagner 10% de leurs gains</p>
        </div>

        <div class="stats-container">
          <div class="stat-card">
            <span class="stat-value" id="referral-count">-</span>
            <span class="stat-label">Filleuls actifs</span>
          </div>
          <div class="stat-card">
            <span class="stat-value" id="referral-earnings">-</span>
            <span class="stat-label">Vos récompenses</span>
          </div>
        </div>

        <div id="referral-list" class="referral-list">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;

    try {
      const tg = window.Telegram.WebApp;
      if (!tg.initData) throw new Error("Données Telegram non disponibles");

      // 1. Récupération FORCÉE de l'ID utilisateur
      const user = tg.initDataUnsafe.user;
      if (!user?.id) throw new Error("ID utilisateur introuvable");
      
      console.log("User ID:", user.id); // Debug crucial

      // 2. Génération ABSOLUE du lien
      const BOT_USERNAME = 'CRYPTORATS_bot'; // À confirmer
      const referralCode = `ref_${user.id}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${referralCode}`;
      
      // 3. Mise à jour IMMÉDIATE du champ lien
      const linkInput = document.getElementById('referral-link');
      if (!linkInput) throw new Error("Champ lien introuvable");
      linkInput.value = referralLink;

      // 4. Activation du bouton copie
      const copyBtn = document.getElementById('copy-referral-btn');
      if (copyBtn) {
        copyBtn.disabled = false;
        copyBtn.addEventListener('click', async () => {
          try {
            linkInput.select();
            document.execCommand('copy');
            
            // Feedback visuel robuste
            const icon = copyBtn.querySelector('.copy-icon');
            const text = copyBtn.querySelector('.copy-text');
            if (icon) icon.textContent = '✓';
            if (text) text.textContent = 'Copié!';
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (icon) icon.textContent = '⎘';
            if (text) text.textContent = 'Copier';
          } catch (copyError) {
            console.error("Erreur copie:", copyError);
          }
        });
      }

      // 5. Enregistrement backend avec timeout
      const registerPromise = fetch('/register-referral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': tg.initData
        },
        body: JSON.stringify({
          userId: user.id,
          referralCode: referralCode,
          username: user.username || 'Anonyme'
        })
      });

      // 6. Récupération des données avec gestion d'erreur séparée
      const statsPromise = fetch('/get-referrals', {
        headers: {
          'Telegram-Data': tg.initData,
          'Content-Type': 'application/json'
        }
      });

      const [registerResponse, statsResponse] = await Promise.all([
        registerPromise.catch(e => ({ ok: false })),
        statsPromise.catch(e => ({ ok: false }))
      ]);

      if (!statsResponse.ok) throw new Error("Erreur stats");

      const referralData = await statsResponse.json();
      console.log("Données reçues:", referralData);

      // 7. Mise à jour UI avec vérifications en cascade
      const safeUpdate = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value ?? '-';
      };

      safeUpdate('referral-count', referralData.referralCount);
      safeUpdate('referral-earnings', referralData.earnedTokens);

      const listContainer = document.getElementById('referral-list');
      if (listContainer) {
        listContainer.innerHTML = referralData.referrals?.length > 0 
          ? referralData.referrals.map(ref => `
              <div class="referral-item">
                <div class="referral-info">
                  <span class="referral-name">${ref.username || 'Anonyme'}</span>
                  <span class="referral-date">${new Date(ref.date).toLocaleDateString('fr-FR')}</span>
                </div>
                <span class="reward-badge">+${Math.floor(ref.reward * 0.1)} tokens</span>
              </div>
            `).join('')
          : `<p class="no-referrals">🔍 Aucun filleul actif</p>`;
      }

    } catch (error) {
      console.error("Erreur Referral:", error);
      
      // Fallback complet
      const linkInput = document.getElementById('referral-link');
      if (linkInput) {
        linkInput.value = 'https://t.me/CRYPTORATS_bot';
      }

      const copyBtn = document.getElementById('copy-referral-btn');
      if (copyBtn) copyBtn.disabled = false;

      const errorContainer = document.getElementById('referral-list') || content;
      if (errorContainer) {
        errorContainer.innerHTML = `
          <div class="error-message">
            <p>${error.message || 'Erreur de chargement'}</p>
            <button onclick="ReferralPage.showReferralPage()" class="retry-button">
              ↻ Réessayer
            </button>
          </div>
        `;
      }
    }
  }
};

window.ReferralPage = ReferralPage;