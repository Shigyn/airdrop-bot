from dotenv import load_dotenv
import re
import ssl
from io import BytesIO
from time import gmtime, strftime

import pymysql
import telebot
from aiohttp import web
from telebot import types
from telebot.types import InlineKeyboardButton, InlineKeyboardMarkup

import config
import os

# Load environment variables
load_dotenv()

# Webhook and Bot settings
WEBHOOK_HOST = config.host  # L'hôte de ton projet sur Railway
WEBHOOK_PORT = 8443
WEBHOOK_LISTEN = "0.0.0.0"

# Railway provides SSL, so we don't need cert files on local
WEBHOOK_URL_BASE = f"https://{WEBHOOK_HOST}"
WEBHOOK_URL_PATH = f"/{config.api_token}/"

bot = telebot.TeleBot(config.api_token)
app = web.Application()

# Database connection
def get_connection():
    """ Function to get MySQL connection from Railway's environment variables """
    # Load MySQL connection details from environment variables
    mysql_host = os.getenv('MYSQL_HOST', 'maglev.proxy.rlwy.net')  # Default value for Railway MySQL host
    mysql_user = os.getenv('MYSQL_USER', 'root')
    mysql_pw = os.getenv('MYSQL_PASSWORD', 'wIlRKdNrsyUhxOpdMiIHXigmJllySBJS')  # Use actual password from Railway
    mysql_db = os.getenv('MYSQL_DB', 'railway')  # Default database name

    return pymysql.connect(
        host=mysql_host,
        user=mysql_user,
        password=mysql_pw,
        db=mysql_db,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )

# Create database tables if not exist
def create_tables():
    connection = get_connection()
    with connection.cursor() as cursor:
        table_name = "users"
        try:
            cursor.execute(
                f"CREATE TABLE `{table_name}` ("
                "`user_id` varchar(15) DEFAULT NULL,"
                "`address` varchar(42) DEFAULT NULL,"
                "`address_change_status` tinyint DEFAULT 0,"
                "`captcha` tinyint DEFAULT NULL)"
            )
            print("Database tables created.")
        except Exception as e:
            print(f"Error while creating tables: {e}")

# Load airdrop data
def get_airdrop_wallets():
    connection = get_connection()
    with connection.cursor() as cursor:
        cursor.execute("SELECT address FROM users WHERE address IS NOT NULL")
        return [user["address"] for user in cursor.fetchall()]

def get_airdrop_users():
    connection = get_connection()
    with connection.cursor() as cursor:
        cursor.execute("SELECT user_id FROM users WHERE address IS NOT NULL")
        return [user["user_id"] for user in cursor.fetchall()]

# Keyboards
default_keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True)
default_keyboard.row(types.KeyboardButton("🚀 Join Airdrop"))

airdrop_keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True)
airdrop_keyboard.row(types.KeyboardButton("💼 View Wallet Address"))

def cancel_button():
    markup = InlineKeyboardMarkup()
    markup.add(InlineKeyboardButton("Cancel Operation", callback_data="cancel_input"))
    return markup

def update_wallet_address_button(message):
    connection = get_connection()
    with connection.cursor() as cursor:
        cursor.execute("SELECT address_change_status FROM users WHERE user_id = %s", message.chat.id)
        address_changes = cursor.fetchone()["address_change_status"]
        markup = InlineKeyboardMarkup()
        markup.add(
            InlineKeyboardButton(
                f"Update Address ({address_changes}/{config.wallet_changes})",
                callback_data="edit_wallet_address",
            )
        )
        return markup

# Handlers
@bot.message_handler(func=lambda message: message.chat.type == "private", commands=["start"])
def start_handler(message):
    connection = get_connection()
    with connection.cursor() as cursor:
        bot.send_chat_action(message.chat.id, "typing")
        cursor.execute("SELECT EXISTS(SELECT user_id FROM users WHERE user_id = %s)", message.chat.id)
        if not list(cursor.fetchone().values())[0]:
            cursor.execute("INSERT INTO users(user_id) VALUES (%s)", message.chat.id)

        if message.chat.id in airdrop_users:
            bot.send_message(
                message.chat.id,
                config.texts["start_2"].format(message.from_user.first_name) +
                "[» Source Code](https://github.com/fabston/Telegram-Airdrop-Bot).",
                parse_mode="Markdown",
                disable_web_page_preview=True,
                reply_markup=airdrop_keyboard,
            )
        elif not config.airdrop_live:
            bot.send_message(
                message.chat.id,
                config.texts["airdrop_start"] +
                "[» Source Code](https://github.com/fabston/Telegram-Airdrop-Bot).",
                parse_mode="Markdown",
                disable_web_page_preview=True,
            )
        elif len(airdrop_users) >= config.airdrop_cap:
            bot.send_message(
                message.chat.id,
                config.texts["airdrop_max_cap"] +
                "[» Source Code](https://github.com/fabston/Telegram-Airdrop-Bot).",
                parse_mode="Markdown",
                disable_web_page_preview=True,
            )
        else:
            bot.send_message(
                message.chat.id,
                config.texts["start_1"].format(message.from_user.first_name) +
                "[» Source Code](https://github.com/fabston/Telegram-Airdrop-Bot).",
                parse_mode="Markdown",
                disable_web_page_preview=True,
                reply_markup=default_keyboard,
            )

# Callbacks
@bot.callback_query_handler(func=lambda call: True)
def callback_query(call):
    if call.data == "cancel_input":
        bot.delete_message(chat_id=call.message.chat.id, message_id=call.message.message_id)
        if len(airdrop_users) >= config.airdrop_cap:
            bot.send_message(call.message.chat.id, "✅ Operation canceled.\n\nℹ️ The airdrop reached its max cap.")
        elif call.message.chat.id in airdrop_users:
            bot.send_message(call.message.chat.id, "✅ Operation canceled.", reply_markup=airdrop_keyboard)
        else:
            bot.send_message(call.message.chat.id, "✅ Operation canceled.", reply_markup=default_keyboard)
        bot.clear_step_handler_by_chat_id(call.message.chat.id)

# Initial setup
create_tables()
airdrop_users = get_airdrop_users()
airdrop_wallets = get_airdrop_wallets()

bot.enable_save_next_step_handlers(delay=2)
bot.load_next_step_handlers()

bot.remove_webhook()
bot.set_webhook(url=WEBHOOK_URL_BASE + WEBHOOK_URL_PATH)

# Web server
async def handle(request):
    if request.match_info.get("token") == bot.token:
        request_body_dict = await request.json()
        update = telebot.types.Update.de_json(request_body_dict)
        bot.process_new_updates([update])
        return web.Response()
    return web.Response(status=403)

app.router.add_post("/{token}/", handle)

web.run_app(app, host=WEBHOOK_LISTEN, port=WEBHOOK_PORT)
