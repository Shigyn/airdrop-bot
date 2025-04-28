import requests

# L'URL du fichier PHP pour mettre à jour le score d'un utilisateur
url = 'https://tronquest.free.nf/update_score.php'

# Fonction pour mettre à jour le score d'un utilisateur
def update_score(username, new_score):
    # Données à envoyer dans la requête POST
    data = {
        'username': username,  # Nom d'utilisateur
        'new_score': new_score  # Nouveau score
    }

    # Envoi de la requête POST au fichier PHP
    response = requests.post(url, data=data)

    # Affiche la réponse du serveur
    print(response.text)

# Exemple d'appel de la fonction pour mettre à jour le score
update_score('nouvel_utilisateur', 100)
