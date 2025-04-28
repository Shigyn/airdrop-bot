# --------------------------------------------- #
# Plugin Name           : TelegramAirdropBot    #
# Author Name           : fabston               #
# File Name             : config.py             #
# --------------------------------------------- #

# Enable / disable the airdrop (True or False)
airdrop_live = True

# Telegram Bot Token
# Your Telegram Bot token from BotFather
api_token = "7719262617:AAFyRYLXOOp16NwqJiq1Rcl_l96c5JHsNKc"

# Host settings (Only required if you're deploying the bot via a specific server)
host = ""  # The server IP or host, leave empty if not needed.

# Telegram channel for logging (use your channel ID here)
log_channel = 0  # Example: -1001355597767

# Telegram User ID's for admins (Admins can use "/airdroplist" command)
admins = []  # List of Telegram User IDs for admin users.

# Airdrop settings
airdrop_cap = 100  # Maximum number of airdrop submissions allowed.
wallet_changes = 3  # How many times a user can change their wallet address.

# Google Sheets configuration
# Set the ID of the Google Sheets file and the range for your data.
SPREADSHEET_ID = '1BBGrkXcQuAK2JcNoOCc5Im8SgC7-MGixm7usyAzscHI'  # Google Sheets ID
RANGE_NAME = 'Sheet1!A:D'  # Range in the sheet, here A:D for user ID, Name, etc.

# Webhook settings (Optional, leave empty if you're not using webhook)
WEBHOOK_HOST = ""  # Webhook URL if needed, leave empty if you're not using a webhook.

# Texts used for Telegram bot messages
texts = {
    "start_1": "Hi {} and welcome to our Airdrop!\n\nGet started by clicking the button below.\n\n",
    "start_2": "Hi {},\n\nYour address has been added to the airdrop list!\n\n",
    "start_captcha": "Hi {},\n\n",
    "airdrop_start": "The airdrop didn't start yet.",
    "airdrop_address": "Type in your address:",
    "airdrop_max_cap": "ℹ️ The airdrop reached its max cap.",
    "airdrop_walletused": "⚠️ That address has already been used. Use a different one.",
    "airdrop_confirmation": "✅ Your address has been added to airdrop list.",
    "airdrop_wallet_update": "✅ Your address has been updated.",
}
