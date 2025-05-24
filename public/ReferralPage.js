const ReferralPage = {
  showReferralPage: async function() {
    const content = document.getElementById('content');
    if (!content) {
      console.error("Element 'content' introuvable");
      return;
    }

    try {
      // Template simplifié pour débuggage
      content.innerHTML = `
        <div class="referral-container">
          <h2>Programme de Parrainage</h2>
          <div id="ref-data">Chargement en cours...</div>
        </div>
      `;

      const tg = window.Telegram?.WebApp;
      if (!tg?.initDataUnsafe?.user?.id) {
        throw new Error("Non connecté via Telegram");
      }

      const userId = tg.initDataUnsafe.user.id;
      console.log("Fetching referrals for user:", userId);

      const response = await fetch(`/api/referrals?user_id=${userId}`, {
        headers: {
          'Telegram-Data': tg.initData,
          'Content-Type': 'application/json'
        }
      });

      console.log("Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("Referral data received:", data);

      // Afficher les données brutes pour debug
      document.getElementById('ref-data').innerHTML = `
        <pre>${JSON.stringify(data, null, 2)}</pre>
        <button onclick="location.reload()">Rafraîchir</button>
      `;

    } catch (error) {
      console.error("Erreur ReferralPage:", error);
      content.innerHTML = `
        <div class="error">
          Erreur: ${error.message}
          <button onclick="ReferralPage.showReferralPage()">Réessayer</button>
        </div>
      `;
    }
  }
};