from dotenv import load_dotenv
import os
import telebot
from telebot.types import InlineKeyboardButton, InlineKeyboardMarkup
import config
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from aiohttp import web
import json

# Charger les variables d'environnement
load_dotenv()

# Initialiser le bot Telegram
bot = telebot.TeleBot(config.api_token)
app = web.Application()

# Configurer l'accès à Google Sheets
def get_google_sheets_client():
    """Fonction pour se connecter à Google Sheets en utilisant les credentials"""
    # Utiliser les credentials pour accéder à Google Sheets
    scope = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(
        "google/credentials.json", scope  # Assurez-vous que le chemin est correct
    )
    client = gspread.authorize(creds)
    return client.open_by_key(config.SPREADSHEET_ID)

# Fonction pour récupérer ou ajouter un utilisateur dans Google Sheets
def add_user_to_sheet(user_id, address=None):
    """Ajouter un utilisateur dans la feuille Google Sheets"""
    client = get_google_sheets_client()
    sheet = client.worksheet("Sheet1")  # Remplace "Sheet1" par le nom de ta feuille si nécessaire
    try:
        # Vérifier si l'utilisateur existe déjà
        cell = sheet.find(str(user_id))
        if cell:
            return False  # L'utilisateur existe déjà
    except gspread.exceptions.CellNotFound:
        # Ajouter l'utilisateur si non trouvé
        sheet.append_row([user_id, address if address else ""])  # Ajouter la ligne de l'utilisateur
        return True

# Handlers pour les commandes Telegram
@bot.message_handler(func=lambda message: message.chat.type == "private", commands=["start"])
def start_handler(message):
    """ Handler pour la commande /start """
    if message and message.chat:
        # Ajout de l'utilisateur dans Google Sheets si nécessaire
        user_added = add_user_to_sheet(message.chat.id)
        if user_added:
            bot.send_message(
                message.chat.id,
                f"Bonjour {message.from_user.first_name} ! Bienvenue dans le bot.",
                reply_markup=InlineKeyboardMarkup().add(
                    InlineKeyboardButton("Voir mes informations", callback_data="view_info")
                )
            )
        else:
            bot.send_message(
                message.chat.id,
                f"Bonjour {message.from_user.first_name} ! Vous êtes déjà inscrit.",
                reply_markup=InlineKeyboardMarkup().add(
                    InlineKeyboardButton("Voir mes informations", callback_data="view_info")
                )
            )

# Commande pour tester la webapp
@bot.message_handler(commands=["webapp"])
def webapp_handler(message):
    bot.send_message(message.chat.id, "Voici la page web de test", reply_markup=InlineKeyboardMarkup().add(
        InlineKeyboardButton("Voir la webapp", url="https://harmonious-spontaneity.up.railway.app/")
    ))

# Callbacks
@bot.callback_query_handler(func=lambda call: call.data == "view_info")
def view_info_callback(call):
    bot.send_message(call.message.chat.id, "Voici vos informations : [ici les infos]")
    bot.answer_callback_query(call.id)

# Route pour accepter le webhook (l'URL doit correspondre à ce format dans l'API Telegram)
async def handle(request):
    if request.match_info.get("token") == bot.token:
        try:
            request_body_dict = await request.json()
            update = telebot.types.Update.de_json(request_body_dict)
            bot.process_new_updates([update])
            return web.Response()
        except Exception as e:
            print(f"Erreur lors du traitement de la mise à jour : {e}")
            return web.Response(status=500)
    return web.Response(status=403)

# Route pour vérifier si l'URL du webhook est bien définie
async def webhook(request):
    return web.Response(text="Webhook configuré correctement", content_type="text/plain")

# Initialiser les routes
app.router.add_post("/{token}/", handle)
app.router.add_get("/webhook", webhook)

# Webhook Setup
WEBHOOK_URL = f"https://{config.WEBHOOK_HOST}/{config.api_token}/"
bot.remove_webhook()
bot.set_webhook(url=WEBHOOK_URL)

# Lancer le serveur
if __name__ == "__main__":
    from aiohttp import web
    web.run_app(app, host="0.0.0.0", port=8443)
