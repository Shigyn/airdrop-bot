import requests

# L'URL du fichier PHP pour obtenir le score d'un utilisateur
url = 'https://tronquest.free.nf/get_score.php'

# Fonction pour récupérer le score d'un utilisateur
def get_score(username):
    # Données à envoyer dans la requête POST
    data = {
        'username': username  # Nom d'utilisateur
    }

    # Envoi de la requête POST au fichier PHP
    response = requests.post(url, data=data)

    # Affiche la réponse du serveur (score)
    print(response.text)

# Exemple d'appel de la fonction avec un nom d'utilisateur
get_score('nouvel_utilisateur')
