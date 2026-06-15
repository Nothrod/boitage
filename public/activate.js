/*
|--------------------------------------------------------------------------
| Map Boitage - Activation compte
|--------------------------------------------------------------------------
|
| Fichier : public/activate.js
|
| Rôle :
| - récupérer le token présent dans l'URL
| - charger les informations du compte à activer
| - permettre à l'utilisateur de choisir son mot de passe
| - permettre à l'utilisateur de renseigner son email, optionnellement
| - envoyer l'activation au backend
| - rediriger vers la page de connexion après activation
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Récupération du token dans l'URL
|--------------------------------------------------------------------------
|
| Exemple attendu :
| /activate.html?token=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
|
|--------------------------------------------------------------------------
*/

const params = new URLSearchParams(window.location.search);
const token = params.get("token");

/*
|--------------------------------------------------------------------------
| Éléments du DOM
|--------------------------------------------------------------------------
*/

const userNameBox = document.getElementById("userName");
const userUsernameBox = document.getElementById("userUsername");

const activateForm = document.getElementById("activateForm");
const messageBox = document.getElementById("message");

/*
|--------------------------------------------------------------------------
| Affichage des messages
|--------------------------------------------------------------------------
*/

function showMessage(text, type = "error") {
    messageBox.textContent = text;
    messageBox.className = `message ${type}`;
}

/*
|--------------------------------------------------------------------------
| Chargement des informations du compte
|--------------------------------------------------------------------------
|
| Cette fonction appelle :
| GET /api/activate/:token
|
| Elle permet d'afficher :
| - le nom
| - l'identifiant
|
|--------------------------------------------------------------------------
*/

async function loadActivationInfo() {
    if (!token) {
        showMessage("Lien d'activation invalide : token manquant.");
        return;
    }

    try {
        const response = await fetch(`/api/activate/${token}`, {
            method: "GET",
            cache: "no-store"
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            showMessage(data.message || "Lien d'activation invalide.");
            return;
        }

        userNameBox.textContent = data.name;
        userUsernameBox.textContent = data.username;

    } catch (error) {
        console.error("Erreur activation info :", error);
        showMessage("Erreur lors du chargement du compte.");
    }
}

/*
|--------------------------------------------------------------------------
| Validation formulaire activation
|--------------------------------------------------------------------------
|
| Champs :
| - email optionnel
| - mot de passe obligatoire
| - confirmation obligatoire
|
|--------------------------------------------------------------------------
*/

activateForm.addEventListener("submit", async event => {
    event.preventDefault();

    const emailInput = document.getElementById("email");

    const email = emailInput
        ? emailInput.value.trim()
        : "";

    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!token) {
        showMessage("Token manquant.");
        return;
    }

    if (password !== confirmPassword) {
        showMessage("Les mots de passe ne correspondent pas.");
        return;
    }

    if (password.length < 8) {
        showMessage("Le mot de passe doit contenir au moins 8 caractères.");
        return;
    }

    try {
        const response = await fetch("/api/activate", {
            method: "POST",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                token,
                password,
                email
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            showMessage(data.message || "Activation impossible.");
            return;
        }

        showMessage(
            "Compte activé avec succès. Vous pouvez vous connecter.",
            "success"
        );

        setTimeout(() => {
            window.location.replace("/");
        }, 1500);

    } catch (error) {
        console.error("Erreur activation :", error);
        showMessage("Erreur lors de l'activation du compte.");
    }
});

/*
|--------------------------------------------------------------------------
| Initialisation
|--------------------------------------------------------------------------
*/

loadActivationInfo();