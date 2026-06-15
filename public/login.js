/*
|--------------------------------------------------------------------------
| Map Boitage - Connexion
|--------------------------------------------------------------------------
|
| Fichier : public/login.js
|
| Rôle :
| - gérer le formulaire de connexion
| - appeler /api/login
| - rediriger vers backend.html si connexion OK
| - gérer "Mot de passe oublié"
| - appeler /api/forgot-password
|
| Important :
| Le lien de réinitialisation n'est jamais affiché dans le navigateur.
| Il est uniquement envoyé par email côté serveur.
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Éléments du DOM
|--------------------------------------------------------------------------
*/

const loginForm = document.getElementById("loginForm");
const messageBox = document.getElementById("message");

const forgotPasswordLink = document.getElementById(
    "forgotPasswordLink"
);

const forgotPasswordForm = document.getElementById(
    "forgotPasswordForm"
);

const forgotUsernameInput = document.getElementById(
    "forgotUsername"
);

/*
|--------------------------------------------------------------------------
| Affichage des messages
|--------------------------------------------------------------------------
*/

function showMessage(message, type = "success") {
    if (!messageBox) {
        console.log(message);
        return;
    }

    messageBox.textContent = message;
    messageBox.className = "message";

    if (type) {
        messageBox.classList.add(type);
    }
}

/*
|--------------------------------------------------------------------------
| Connexion utilisateur
|--------------------------------------------------------------------------
*/

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const username = document
            .getElementById("username")
            .value
            .trim();

        const password = document
            .getElementById("password")
            .value;

        messageBox.textContent = "";
        messageBox.className = "message";

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                credentials: "include",
                cache: "no-store",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username,
                    password
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                showMessage(
                    data.message || "Identifiants incorrects.",
                    "error"
                );

                return;
            }

            showMessage(
                "Connexion réussie.",
                "success"
            );

            /*
            |--------------------------------------------------------------------------
            | Redirection vers le backend
            |--------------------------------------------------------------------------
            */

            window.location.replace("/backend.html");

        } catch (error) {
            console.error(
                "Erreur connexion :",
                error
            );

            showMessage(
                "Erreur de connexion au serveur.",
                "error"
            );
        }
    });
}

/*
|--------------------------------------------------------------------------
| Affichage du formulaire mot de passe oublié
|--------------------------------------------------------------------------
|
| Quand l'utilisateur clique sur "Mot de passe oublié ?",
| on affiche ou on cache le formulaire de récupération.
|
|--------------------------------------------------------------------------
*/

if (
    forgotPasswordLink &&
    forgotPasswordForm
) {
    forgotPasswordLink.addEventListener(
        "click",
        (event) => {
            event.preventDefault();

            const isHidden =
                forgotPasswordForm.style.display === "none" ||
                forgotPasswordForm.style.display === "";

            forgotPasswordForm.style.display =
                isHidden
                    ? "block"
                    : "none";

            /*
            |--------------------------------------------------------------------------
            | Nettoyage du message
            |--------------------------------------------------------------------------
            */

            showMessage("", "");
        }
    );
}

/*
|--------------------------------------------------------------------------
| Demande de réinitialisation du mot de passe
|--------------------------------------------------------------------------
|
| Le frontend envoie uniquement l'identifiant.
|
| Le backend :
| - cherche l'utilisateur
| - vérifie qu'un email existe
| - génère le token
| - envoie le lien par email
|
| Important :
| Le backend ne renvoie pas le lien au navigateur.
|
|--------------------------------------------------------------------------
*/

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            const username =
                forgotUsernameInput.value.trim();

            if (!username) {
                showMessage(
                    "Veuillez saisir votre identifiant.",
                    "error"
                );

                return;
            }

            try {
                const response = await fetch(
                    "/api/forgot-password",
                    {
                        method: "POST",
                        cache: "no-store",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            username
                        })
                    }
                );

                const data = await response.json();

                if (
                    !response.ok ||
                    !data.success
                ) {
                    showMessage(
                        data.message ||
                        "Erreur lors de la demande de réinitialisation.",
                        "error"
                    );

                    return;
                }

                /*
                |--------------------------------------------------------------------------
                | Message de confirmation
                |--------------------------------------------------------------------------
                |
                | On affiche seulement un message neutre.
                | Jamais le lien.
                |
                |--------------------------------------------------------------------------
                */

                showMessage(
                    data.message ||
                    "Si un compte actif possède un email renseigné, un lien de réinitialisation a été envoyé.",
                    "success"
                );

                forgotUsernameInput.value = "";

                forgotPasswordForm.style.display = "none";

            } catch (error) {
                console.error(
                    "Erreur forgot-password :",
                    error
                );

                showMessage(
                    "Erreur serveur.",
                    "error"
                );
            }
        }
    );
}