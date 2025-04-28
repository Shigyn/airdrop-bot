from dotenv import load_dotenv
import os
import pymysql
import telebot
from aiohttp import web
from telebot.types import InlineKeyboardButton, InlineKeyboardMarkup
import config

# Charger les variables d'environnement
load_dotenv()

# Webhook et paramètres du Bot
WEBHOOK_HOST = config.host  # L'hôte de ton projet sur Railway
WEBHOOK_PORT = 8443
WEBHOOK_LISTEN = "0.0.0.0"

WEBHOOK_URL_BASE = f"https://{WEBHOOK_HOST}"
WEBHOOK_URL_PATH = f"/{config.api_token}/"

bot = telebot.TeleBot(config.api_token)
app = web.Application()

# Connexion à la base de données
def get_connection():
    """Fonction pour obtenir la connexion MySQL depuis les variables d'environnement de Railway"""
    mysql_host = os.getenv('MYSQL_HOST', 'maglev.proxy.rlwy.net')  # Par défaut pour Railway MySQL host
    mysql_user = os.getenv('MYSQL_USER', 'root')
    mysql_pw = os.getenv('MYSQL_PASSWORD', 'wIlRKdNrsyUhxOpdMiIHXigmJllySBJS')  # Utiliser le mot de passe réel
    mysql_db = os.getenv('MYSQL_DB', 'railway')  # Nom de la base de données par défaut

    return pymysql.connect(
        host=mysql_host,
        user=mysql_user,
        password=mysql_pw,
        db=mysql_db,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )

# Créer les tables dans la base de données si elles n'existent pas
def create_tables():
    connection = get_connection()
    with connection.cursor() as cursor:
        try:
            cursor.execute(
                "CREATE TABLE IF NOT EXISTS `users` ("
                "`user_id` varchar(15) PRIMARY KEY,"
                "`address` varchar(42) DEFAULT NULL)"
            )
            print("Table 'users' vérifiée ou créée.")
        except Exception as e:
            print(f"Erreur lors de la création des tables: {e}")

# Handlers
@bot.message_handler(func=lambda message: message.chat.type == "private", commands=["start"])
def start_handler(message):
    """ Handler pour la commande /start """
    connection = get_connection()
    with connection.cursor() as cursor:
        cursor.execute("SELECT EXISTS(SELECT user_id FROM users WHERE user_id = %s)", message.chat.id)
        if not list(cursor.fetchone().values())[0]:
            cursor.execute("INSERT INTO users(user_id) VALUES (%s)", message.chat.id)

        bot.send_message(
            message.chat.id,
            f"Bonjour {message.from_user.first_name} ! Bienvenue dans le bot.",
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

# Initialisation de la base de données et ajout des utilisateurs
create_tables()

# Webhook Setup
bot.remove_webhook()
bot.set_webhook(url=WEBHOOK_URL_BASE + WEBHOOK_URL_PATH)

# Serveur Web pour le webhook
async def handle(request):
    if request.match_info.get("token") == bot.token:
        request_body_dict = await request.json()
        update = telebot.types.Update.de_json(request_body_dict)
        bot.process_new_updates([update])
        return web.Response()
    return web.Response(status=403)

app.router.add_post("/{token}/", handle)

# Route pour la webapp de test
async def webapp(request):
    return web.Response(text="<h1>Bienvenue sur la webapp de test!</h1><p>Test en cours...</p>", content_type="text/html")

app.router.add_get("/webapp", webapp)

# Lancer le serveur
web.run_app(app, host=WEBHOOK_LISTEN, port=WEBHOOK_PORT)
