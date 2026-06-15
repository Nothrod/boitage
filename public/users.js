/*
|--------------------------------------------------------------------------
| Map Boitage - Utilisateurs
|--------------------------------------------------------------------------
|
| Fichier : public/users.js
|
| Rôle :
| Gérer toute la partie utilisateurs :
| - afficher les utilisateurs
| - créer un utilisateur
| - modifier un utilisateur existant
| - modifier le rôle
| - modifier les équipes
| - afficher le lien d'activation
| - copier le lien d'activation
| - supprimer un utilisateur
|
|--------------------------------------------------------------------------
*/

const usersContainer = document.getElementById("usersContainer");
const createUserBtn = document.getElementById("createUserBtn");
const userModal = document.getElementById("userModal");
const userForm = document.getElementById("userForm");
const userNameInput = document.getElementById("userName");
const userUsernameInput = document.getElementById("userUsername");
const userRoleInput = document.getElementById("userRole");
const userTeamsBox = document.getElementById("userTeams");
const cancelUserBtn = document.getElementById("cancelUserBtn");

/*
|--------------------------------------------------------------------------
| Variables globales
|--------------------------------------------------------------------------
*/

let availableTeams = [];
let usersCache = [];
let editingUserId = null;

/*
|--------------------------------------------------------------------------
| Chargement des équipes
|--------------------------------------------------------------------------
|
| Correction importante :
| La route backend est :
| GET /api/users/teams
|
|--------------------------------------------------------------------------
*/

async function loadAvailableTeams() {
    const data = await api("/api/users/teams");

    availableTeams = data && Array.isArray(data.teams)
        ? data.teams
        : [];

    return availableTeams;
}

/*
|--------------------------------------------------------------------------
| Affichage des checkbox équipes
|--------------------------------------------------------------------------
*/

function renderUserTeamsCheckboxes(selectedTeamIds = []) {
    if (!userTeamsBox) {
        return;
    }

    if (!availableTeams.length) {
        userTeamsBox.innerHTML =
            "<p>Aucune équipe disponible. Crée d'abord une équipe.</p>";
        return;
    }

    userTeamsBox.innerHTML = availableTeams.map(team => {
        const teamId = Number(team.id);

        const checked = selectedTeamIds.includes(teamId)
            ? "checked"
            : "";

        return `
            <label class="checkbox-item">
                <input
                    type="checkbox"
                    value="${teamId}"
                    ${checked}
                >
                ${escapeHtml(team.name)}
            </label>
        `;
    }).join("");
}

/*
|--------------------------------------------------------------------------
| Récupérer les équipes cochées
|--------------------------------------------------------------------------
*/

function getSelectedUserTeamIds() {
    if (!userTeamsBox) {
        return [];
    }

    return Array.from(
        userTeamsBox.querySelectorAll("input[type='checkbox']:checked")
    ).map(input => Number(input.value));
}

/*
|--------------------------------------------------------------------------
| Libellé des rôles
|--------------------------------------------------------------------------
*/

function getRoleLabel(role) {
    if (role === "admin") {
        return "Administrateur";
    }

    if (role === "manager") {
        return "Manager d'équipe";
    }

    return "Utilisateur";
}

/*
|--------------------------------------------------------------------------
| Reset popup utilisateur
|--------------------------------------------------------------------------
*/

function resetUserModal() {
    editingUserId = null;

    userNameInput.disabled = false;
    userUsernameInput.disabled = false;
    userRoleInput.disabled = false;

    userNameInput.value = "";
    userUsernameInput.value = "";
    userRoleInput.value = "user";

    if (userTeamsBox) {
        userTeamsBox.innerHTML = "";
    }

    const title = userModal.querySelector("h3");

    if (title) {
        title.textContent = "Nouvel utilisateur";
    }

    const submitBtn = userForm.querySelector("button[type='submit']");

    if (submitBtn) {
        submitBtn.textContent = "Créer l'utilisateur";
    }
}

/*
|--------------------------------------------------------------------------
| Charger les utilisateurs
|--------------------------------------------------------------------------
*/

async function loadUsers() {
    try {
        const data = await api("/api/users");

        if (!data) {
            return;
        }

        usersCache = Array.isArray(data.users)
            ? data.users
            : [];

        if (!usersContainer) {
            showMessage("Zone utilisateurs introuvable.", "error");
            return;
        }

        if (!usersCache.length) {
            usersContainer.innerHTML = "<p>Aucun utilisateur.</p>";
            return;
        }

        usersContainer.innerHTML = usersCache.map(user => {
            const userId = Number(user.id);

            const role = ["user", "manager", "admin"].includes(user.role)
                ? user.role
                : "user";

            const isActive = Number(user.is_active) === 1;
            const token = user.token || "";

            const activationLink = token
                ? `${window.location.origin}/activate.html?token=${token}`
                : "";

            const teams = Array.isArray(user.teams)
                ? user.teams
                : [];

            const teamsText = teams.length
                ? teams.map(team => team.name).join(", ")
                : "Aucune équipe";

            return `
                <div class="card user-card">
                    <h3>${escapeHtml(user.name)}</h3>

                    <p>
                        Identifiant :
                        ${escapeHtml(user.username)}
                    </p>

                    <p>
                        Email :
                        ${escapeHtml(user.email || "Non renseigné")}
                    </p>

                    <p>
                        Rôle :
                        <strong>${escapeHtml(getRoleLabel(role))}</strong>
                    </p>

                    <p>
                        Équipe(s) :
                        <strong>${escapeHtml(teamsText)}</strong>
                    </p>

                    <p>
                        Statut :
                        <strong>
                            ${isActive ? "Actif" : "En attente d'activation"}
                        </strong>
                    </p>

                    ${
                        !isActive && token
                            ? `
                                <div class="activation-box">
                                    <label>Lien d'activation</label>

                                    <input
                                        type="text"
                                        readonly
                                        value="${escapeHtml(activationLink)}"
                                    >

                                    <button
                                        class="btn btn-primary"
                                        onclick="copyActivationLink('${escapeJs(token)}')"
                                    >
                                        Copier
                                    </button>
                                </div>
                            `
                            : ""
                    }

                    <button
                        class="btn btn-primary"
                        onclick="editUser(${userId})"
                    >
                        Modifier
                    </button>

                    <button
                        class="btn btn-danger"
                        onclick="deleteUser(${userId})"
                    >
                        Supprimer
                    </button>
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("Erreur loadUsers :", error);

        if (usersContainer) {
            usersContainer.innerHTML =
                `<p class="error">${escapeHtml(error.message)}</p>`;
        }
    }
}

/*
|--------------------------------------------------------------------------
| Ouvrir popup création utilisateur
|--------------------------------------------------------------------------
*/

if (createUserBtn) {
    createUserBtn.addEventListener("click", async () => {
        try {
            resetUserModal();

            await loadAvailableTeams();

            renderUserTeamsCheckboxes();

            userModal.classList.remove("hidden");

        } catch (error) {
            console.error("Erreur ouverture utilisateur :", error);
            showMessage(error.message, "error");
        }
    });
}

/*
|--------------------------------------------------------------------------
| Ouvrir popup modification utilisateur
|--------------------------------------------------------------------------
*/

async function editUser(userId) {
    try {
        const id = Number(userId);

        const user = usersCache.find(item => {
            return Number(item.id) === id;
        });

        if (!user) {
            showMessage("Utilisateur introuvable.", "error");
            return;
        }

        editingUserId = id;

        await loadAvailableTeams();

        const selectedTeamIds = Array.isArray(user.teams)
            ? user.teams.map(team => Number(team.id))
            : [];

        userNameInput.value = user.name || "";
        userUsernameInput.value = user.username || "";
        userRoleInput.value = user.role || "user";

        /*
        |--------------------------------------------------------------------------
        | En modification :
        | - le nom est affiché mais bloqué
        | - l'identifiant est affiché mais bloqué
        | - le rôle reste modifiable
        | - les équipes restent modifiables
        |--------------------------------------------------------------------------
        */

        userNameInput.disabled = true;
        userUsernameInput.disabled = true;
        userRoleInput.disabled = false;

        renderUserTeamsCheckboxes(selectedTeamIds);

        const title = userModal.querySelector("h3");

        if (title) {
            title.textContent = "Modifier l'utilisateur";
        }

        const submitBtn = userForm.querySelector("button[type='submit']");

        if (submitBtn) {
            submitBtn.textContent = "Enregistrer";
        }

        userModal.classList.remove("hidden");

    } catch (error) {
        console.error("Erreur editUser :", error);
        showMessage(error.message, "error");
    }
}

/*
|--------------------------------------------------------------------------
| Annuler popup utilisateur
|--------------------------------------------------------------------------
*/

if (cancelUserBtn) {
    cancelUserBtn.addEventListener("click", () => {
        userModal.classList.add("hidden");
        resetUserModal();
    });
}

/*
|--------------------------------------------------------------------------
| Fermer popup au clic extérieur
|--------------------------------------------------------------------------
*/

if (userModal) {
    userModal.addEventListener("click", event => {
        if (event.target === userModal) {
            userModal.classList.add("hidden");
            resetUserModal();
        }
    });
}

/*
|--------------------------------------------------------------------------
| Soumission formulaire utilisateur
|--------------------------------------------------------------------------
*/

if (userForm) {
    userForm.addEventListener("submit", async event => {
        event.preventDefault();

        const role = userRoleInput.value;
        const teamIds = getSelectedUserTeamIds();

        if (!["user", "manager", "admin"].includes(role)) {
            showMessage("Rôle utilisateur invalide.", "error");
            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Règle métier :
        | - admin peut ne pas avoir d'équipe
        | - user et manager doivent avoir au moins une équipe
        |--------------------------------------------------------------------------
        */

        if (role !== "admin" && teamIds.length === 0) {
            showMessage(
                "Un utilisateur ou manager doit avoir au moins une équipe.",
                "error"
            );
            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Mode modification
        |--------------------------------------------------------------------------
        |
        | Correction importante :
        | On enregistre d'abord les équipes, puis le rôle.
        |
        | Pourquoi :
        | Le backend refuse de passer un utilisateur en user ou manager
        | si aucune équipe n'est encore associée.
        |
        |--------------------------------------------------------------------------
        */

        if (editingUserId) {
            try {
                await api(`/api/users/${Number(editingUserId)}/teams`, {
                    method: "PUT",
                    body: JSON.stringify({
                        teamIds
                    })
                });

                await api(`/api/users/${Number(editingUserId)}/role`, {
                    method: "PUT",
                    body: JSON.stringify({
                        role
                    })
                });

                userModal.classList.add("hidden");
                resetUserModal();

                showMessage("Utilisateur modifié.");
                await loadUsers();

            } catch (error) {
                console.error("Erreur modification utilisateur :", error);
                showMessage(error.message, "error");
            }

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Mode création
        |--------------------------------------------------------------------------
        */

        const name = userNameInput.value.trim();
        const username = userUsernameInput.value.trim();

        if (!name || !username) {
            showMessage(
                "Nom complet et identifiant obligatoires.",
                "error"
            );
            return;
        }

        try {
            await api("/api/users", {
                method: "POST",
                body: JSON.stringify({
                    name,
                    username,
                    role,
                    teamIds
                })
            });

            userModal.classList.add("hidden");
            resetUserModal();

            showMessage(
                "Utilisateur créé. Le lien d'activation est visible dans la fiche utilisateur."
            );

            showSection("users");

        } catch (error) {
            console.error("Erreur création utilisateur :", error);
            showMessage(error.message, "error");
        }
    });
}

/*
|--------------------------------------------------------------------------
| Copier lien activation
|--------------------------------------------------------------------------
*/

async function copyActivationLink(token) {
    const activationLink =
        `${window.location.origin}/activate.html?token=${token}`;

    try {
        await navigator.clipboard.writeText(activationLink);

        showMessage("Lien d'activation copié.");

    } catch (error) {
        console.error("Erreur copie lien :", error);

        prompt(
            "Copie manuelle du lien d'activation :",
            activationLink
        );
    }
}

/*
|--------------------------------------------------------------------------
| Supprimer utilisateur
|--------------------------------------------------------------------------
*/

async function deleteUser(id) {
    if (!confirm("Supprimer cet utilisateur ?")) {
        return;
    }

    try {
        await api(`/api/users/${Number(id)}`, {
            method: "DELETE"
        });

        showMessage("Utilisateur supprimé.");
        await loadUsers();

    } catch (error) {
        console.error("Erreur deleteUser :", error);
        showMessage(error.message, "error");
    }
}

/*
|--------------------------------------------------------------------------
| Exposition globale
|--------------------------------------------------------------------------
*/

window.loadUsers = loadUsers;
window.editUser = editUser;
window.copyActivationLink = copyActivationLink;
window.deleteUser = deleteUser;