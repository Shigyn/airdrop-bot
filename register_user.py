import requests

# L'URL du fichier PHP pour enregistrer un utilisateur
url = 'https://tronquest.free.nf/register_user.php'

# Fonction pour enregistrer un nouvel utilisateur
def register_user(username, password):
    # Données à envoyer dans la requête POST
    data = {
        'username': username,  # Nom d'utilisateur
        'password': password   # Mot de passe
    }

    # Envoi de la requête POST au fichier PHP
    response = requests.post(url, data=data)

    # Affiche la réponse du serveur
    print(response.text)

# Exemple d'appel de la fonction avec un nouvel utilisateur
register_user('nouvel_utilisateur', 'motdepassefort')
