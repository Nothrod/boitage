/*
|--------------------------------------------------------------------------
| Map Boitage - Profil utilisateur
|--------------------------------------------------------------------------
|
| Fichier : public/profile.js
|
| Rôle :
| - Afficher le profil utilisateur
| - Afficher nom / identifiant / rôle / équipe(s) en lecture seule
| - Modifier l'email
| - Modifier le mot de passe
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Éléments du DOM
|--------------------------------------------------------------------------
*/

const profileForm =
    document.getElementById("profileForm");

const profileNameText =
    document.getElementById("profileName");

const profileUsernameText =
    document.getElementById("profileUsername");

const profileRoleText =
    document.getElementById("profileRole");

const profileTeamsText =
    document.getElementById("profileTeams");

const profileEmailInput =
    document.getElementById("profileEmail");

const profileCurrentPasswordInput =
    document.getElementById("profileCurrentPassword");

const profileNewPasswordInput =
    document.getElementById("profileNewPassword");

const profileConfirmPasswordInput =
    document.getElementById("profileConfirmPassword");

/*
|--------------------------------------------------------------------------
| Affichage des équipes
|--------------------------------------------------------------------------
|
| Sécurise tous les formats possibles :
| - teams sous forme de tableau : [{ name: "Équipe A" }]
| - teams sous forme de tableau : ["Équipe A"]
| - teams sous forme de texte : "Équipe A, Équipe B"
| - aucune équipe
|
|--------------------------------------------------------------------------
*/

function renderProfileTeams(user) {
    if (!profileTeamsText) {
        return;
    }

    if (!user) {
        profileTeamsText.textContent = "Aucune équipe";
        return;
    }

    if (Array.isArray(user.teams) && user.teams.length > 0) {
        profileTeamsText.textContent = user.teams
            .map(team => {
                if (typeof team === "string") {
                    return team;
                }

                return team.name || team.team_name || "";
            })
            .filter(Boolean)
            .join(", ");

        return;
    }

    if (typeof user.teams === "string" && user.teams.trim()) {
        profileTeamsText.textContent = user.teams;
        return;
    }

    if (typeof user.team_names === "string" && user.team_names.trim()) {
        profileTeamsText.textContent = user.team_names;
        return;
    }

    profileTeamsText.textContent = "Aucune équipe";
}

/*
|--------------------------------------------------------------------------
| Chargement du profil
|--------------------------------------------------------------------------
*/

async function loadProfile() {
    try {
        const data = await api("/api/profile");

        if (!data || !data.user) {
            showMessage("Impossible de charger le profil.", "error");

            if (profileTeamsText) {
                profileTeamsText.textContent = "Aucune équipe";
            }

            return;
        }

        if (profileNameText) {
            profileNameText.textContent =
                data.user.name || "Non renseigné";
        }

        if (profileUsernameText) {
            profileUsernameText.textContent =
                data.user.username || "Non renseigné";
        }

        if (profileRoleText) {
            profileRoleText.textContent =
                data.user.role || "Non renseigné";
        }

        renderProfileTeams(data.user);

        if (profileEmailInput) {
            profileEmailInput.value =
                data.user.email || "";
        }

    } catch (error) {
        console.error("Erreur loadProfile :", error);

        if (profileTeamsText) {
            profileTeamsText.textContent = "Aucune équipe";
        }

        showMessage(error.message, "error");
    }
}

/*
|--------------------------------------------------------------------------
| Sauvegarde profil
|--------------------------------------------------------------------------
*/

if (profileForm) {
    profileForm.addEventListener("submit", async event => {
        event.preventDefault();

        try {
            await api("/api/profile", {
                method: "PUT",
                body: JSON.stringify({
                    email: profileEmailInput.value.trim(),
                    currentPassword: profileCurrentPasswordInput.value,
                    newPassword: profileNewPasswordInput.value,
                    confirmPassword: profileConfirmPasswordInput.value
                })
            });

            profileCurrentPasswordInput.value = "";
            profileNewPasswordInput.value = "";
            profileConfirmPasswordInput.value = "";

            showMessage("Profil mis à jour.");

            await loadProfile();

        } catch (error) {
            console.error("Erreur updateProfile :", error);
            showMessage(error.message, "error");
        }
    });
}

/*
|--------------------------------------------------------------------------
| Sécurité : chargement forcé au clic sur Profil
|--------------------------------------------------------------------------
*/

document
    .querySelector('[data-section="profile"]')
    ?.addEventListener("click", () => {
        console.log("loadProfile appelé");
        loadProfile();
    });

/*
|--------------------------------------------------------------------------
| Exposition globale
|--------------------------------------------------------------------------
*/

console.log("profile.js chargé");

window.loadProfile = loadProfile;