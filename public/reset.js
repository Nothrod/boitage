/*
|--------------------------------------------------------------------------
| Map Boitage - Réinitialisation du mot de passe
|--------------------------------------------------------------------------
|
| Fichier : public/reset.js
|
| Rôle :
| - récupérer le token dans l'URL
| - vérifier les champs du formulaire
| - appeler /api/reset-password
| - rediriger vers la page de connexion si succès
|
|--------------------------------------------------------------------------
*/

const resetPasswordForm = document.getElementById("resetPasswordForm");
const messageBox = document.getElementById("message");

/*
|--------------------------------------------------------------------------
| Récupération du token dans l'URL
|--------------------------------------------------------------------------
*/

const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token");

/*
|--------------------------------------------------------------------------
| Affichage des messages
|--------------------------------------------------------------------------
*/

function showMessage(message, type = "success") {
    messageBox.textContent = message;
    messageBox.className = "message";

    if (type) {
        messageBox.classList.add(type);
    }
}

/*
|--------------------------------------------------------------------------
| Vérification du token
|--------------------------------------------------------------------------
*/

if (!token) {
    showMessage(
        "Lien de réinitialisation invalide ou incomplet.",
        "error"
    );

    if (resetPasswordForm) {
        resetPasswordForm.style.display = "none";
    }
}

/*
|--------------------------------------------------------------------------
| Soumission du formulaire
|--------------------------------------------------------------------------
*/

if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (!password || !confirmPassword) {
            showMessage(
                "Veuillez remplir les deux champs.",
                "error"
            );
            return;
        }

        if (password.length < 8) {
            showMessage(
                "Le mot de passe doit contenir au moins 8 caractères.",
                "error"
            );
            return;
        }

        if (password !== confirmPassword) {
            showMessage(
                "Les mots de passe ne correspondent pas.",
                "error"
            );
            return;
        }

        try {
            const response = await fetch("/api/reset-password", {
                method: "POST",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    token,
                    password
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                showMessage(
                    data.message || "Erreur lors de la réinitialisation.",
                    "error"
                );
                return;
            }

            showMessage(
                "Mot de passe modifié avec succès. Redirection...",
                "success"
            );

            /*
            |--------------------------------------------------------------------------
            | Retour automatique à la connexion
            |--------------------------------------------------------------------------
            */

            setTimeout(() => {
                window.location.replace("/");
            }, 1500);

        } catch (error) {
            console.error("Erreur reset-password :", error);

            showMessage(
                "Erreur de connexion au serveur.",
                "error"
            );
        }
    });
}