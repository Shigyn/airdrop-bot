# Airdrop Telegram Bot + Webapp

## Description

Bot Telegram d’airdrop avec interface web simple, prêt à déployer sur Render.

---

## Variables d'environnement à configurer sur Render

- `GOOGLE_CREDS` : Credentials JSON Google API (string JSON)
- `GOOGLE_CREDS_B64` : Credentials Google API encodés base64 (optionnel, si tu préfères)
- `GOOGLE_SHEET_ID` : ID de ta Google Sheet
- `TASKS_RANGE` : Plage des tâches (exemple : Tasks!A2:D)
- `USER_RANGE` : Plage des utilisateurs (exemple : Users!A2:E)
- `TRANSACTION_RANGE` : Plage des transactions (exemple : Transactions!A2:E)
- `SECRET_KEY` : Clé secrète pour sécuriser les requêtes (optionnel)
- `PUBLIC_URL` : URL publique de ton app (ex: https://tonapp.onrender.com)
- `TELEGRAM_BOT_TOKEN` : Token de ton bot Telegram

---

## Structure des feuilles Google Sheets

### Tasks (exemple)
| TaskID | Description       | Reward | Status  |
|--------|-------------------|--------|---------|
| 1      | Join Telegram     | 10     | active  |
| 2      | Follow Twitter    | 5      | active  |

### Users (exemple)
| UserID | TelegramUsername | Email             | Wallet           | ReferralCode |
|--------|------------------|-------------------|------------------|--------------|
| 1      | @user1           | user1@mail.com    | 0x123...abc      | ABC123       |

### Transactions (exemple)
| TxID | UserID | TaskID | Timestamp           | Status  |
|------|--------|--------|---------------------|---------|
| 1    | 1      | 1      | 2025-05-16 14:00:00 | claimed |

---

## Déploiement sur Render

1. Crée un nouveau service web Node.js.
2. Pousse ce projet sur GitHub et connecte Render à ce repo.
3. Configure les variables d'environnement listées ci-dessus dans le dashboard Render.
4. Lance le déploiement.

---

## Utilisation

- Va sur l’URL publique pour accéder à la page web.
- Le bot Telegram gère les interactions avec les utilisateurs.
- La base de données est dans Google Sheets.

---

## Support

N’hésite pas à modifier et étendre le code selon tes besoins !
