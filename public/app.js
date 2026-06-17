/*
|--------------------------------------------------------------------------
| Map Boitage - Application principale
|--------------------------------------------------------------------------
|
| Fichier : public/app.js
|
| Rôle :
| Ce fichier contient uniquement le cœur de l'application :
|
| - vérification de la session utilisateur
| - affichage du nom de l'utilisateur connecté
| - affichage / masquage selon les rôles
| - navigation entre les sections
| - déconnexion
| - fonction commune api()
| - fonction commune showMessage()
| - helpers rôles :
|   - isAdmin()
|   - isManager()
|   - isManagerOrAdmin()
| - outils communs :
|   - formatDate()
|   - escapeHtml()
|   - escapeJs()
|
| Les autres fonctionnalités sont séparées dans :
| - campaigns.js
| - sectors.js
| - teams.js
| - users.js
| - archives.js
| - profile.js
|
|--------------------------------------------------------------------------
*/

let currentUser = null;

/*
|--------------------------------------------------------------------------
| Raccourcis HTML principaux
|--------------------------------------------------------------------------
*/

const currentUserBox =
    document.getElementById("currentUser");

const logoutBtn =
    document.getElementById("logoutBtn");

const messageBox =
    document.getElementById("messageBox");

const menuButtons =
    document.querySelectorAll(".menu-btn");

const adminOnlyElements =
    document.querySelectorAll(".admin-only");

const managerOnlyElements =
    document.querySelectorAll(".manager-only");

/*
|--------------------------------------------------------------------------
| Messages globaux
|--------------------------------------------------------------------------
*/

function showMessage(text, type = "success") {
    if (!messageBox) {
        console.log(text);
        return;
    }

    messageBox.textContent = text;
    messageBox.className = `message-box ${type}`;
    messageBox.style.display = "block";

    setTimeout(() => {
        messageBox.style.display = "none";
    }, 4000);
}

/*
|--------------------------------------------------------------------------
| Appels API
|--------------------------------------------------------------------------
*/

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (response.status === 401) {
        window.location.replace("/");
        return null;
    }

    if (!response.ok) {
        throw new Error(
            data.message ||
            data.error ||
            "Erreur serveur."
        );
    }

    return data;
}

/*
|--------------------------------------------------------------------------
| Helpers rôles
|--------------------------------------------------------------------------
*/

function isAdmin() {
    return currentUser && currentUser.role === "admin";
}

function isManager() {
    return currentUser && currentUser.role === "manager";
}

function isManagerOrAdmin() {
    return currentUser &&
        ["admin", "manager"].includes(currentUser.role);
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
| Formatage des équipes utilisateur
|--------------------------------------------------------------------------
*/

function getUserTeamsText(user) {
    if (!user) {
        return "";
    }

    if (Array.isArray(user.teams) && user.teams.length > 0) {
        return user.teams
            .map(team => {
                if (typeof team === "string") {
                    return team;
                }

                return team.name || team.team_name || "";
            })
            .filter(Boolean)
            .join(", ");
    }

    if (typeof user.teams === "string" && user.teams.trim()) {
        return user.teams.trim();
    }

    if (
        typeof user.team_names === "string" &&
        user.team_names.trim()
    ) {
        return user.team_names.trim();
    }

    return "";
}

/*
|--------------------------------------------------------------------------
| Vérification de la session
|--------------------------------------------------------------------------
*/

async function checkAuth() {
    try {
        const response = await fetch("/api/me", {
            credentials: "include",
            cache: "no-store"
        });

        const user = await response.json();

        if (!user || !user.id) {
            window.location.replace("/");
            return;
        }

        currentUser = user;
        window.currentUser = user;

        if (currentUserBox) {
            const teamsText = getUserTeamsText(user);

            currentUserBox.textContent =
                `${user.name || "Utilisateur"} ` +
                `(${getRoleLabel(user.role)})` +
                `${teamsText ? ` - ${teamsText}` : ""}`;
        }

        setupRoleDisplay();

        showSection("campaigns");

    } catch (error) {
        console.error("Erreur checkAuth :", error);
        window.location.replace("/");
    }
}

/*
|--------------------------------------------------------------------------
| Affichage selon le rôle
|--------------------------------------------------------------------------
*/

function setupRoleDisplay() {
    const role = currentUser ? currentUser.role : null;

    adminOnlyElements.forEach(element => {
        element.style.display =
            role === "admin" ? "" : "none";
    });

    managerOnlyElements.forEach(element => {
        element.style.display =
            ["admin", "manager"].includes(role) ? "" : "none";
    });
}

/*
|--------------------------------------------------------------------------
| Navigation entre les sections
|--------------------------------------------------------------------------
*/

function showSection(sectionName) {
    document.querySelectorAll(".section").forEach(section => {
        section.classList.add("hidden");
    });

    const targetSection =
        document.getElementById(`${sectionName}Section`);

    if (targetSection) {
        targetSection.classList.remove("hidden");
    }

    if (
        sectionName === "campaigns" &&
        typeof loadCampaigns === "function"
    ) {
        loadCampaigns();
    }

    if (
        sectionName === "profile" &&
        typeof loadProfile === "function"
    ) {
        loadProfile();
    }

    if (
        sectionName === "sectors" &&
        typeof loadSectors === "function"
    ) {
        loadSectors();
    }

    if (
        sectionName === "users" &&
        typeof loadUsers === "function"
    ) {
        loadUsers();
    }
	
	if (
		sectionName === "registrations" &&
		typeof loadRegistrations === "function"
	) {
		loadRegistrations();
	}

    if (
        sectionName === "teams" &&
        typeof loadTeams === "function"
    ) {
        loadTeams();
    }

    if (
        sectionName === "archives" &&
        typeof loadArchives === "function"
    ) {
        loadArchives();
    }
}

menuButtons.forEach(button => {
    button.addEventListener("click", () => {
        showSection(button.dataset.section);
    });
});

/*
|--------------------------------------------------------------------------
| Déconnexion
|--------------------------------------------------------------------------
*/

if (logoutBtn) {
    logoutBtn.addEventListener("click", async event => {
        event.preventDefault();

        try {
            logoutBtn.disabled = true;
            logoutBtn.textContent = "Déconnexion...";

            await fetch("/api/logout", {
                method: "POST",
                credentials: "include",
                cache: "no-store"
            });

        } catch (error) {
            console.error("Erreur logout :", error);
        }

        window.location.replace("/");
    });
}

/*
|--------------------------------------------------------------------------
| Outils communs
|--------------------------------------------------------------------------
*/

function formatDate(dateString) {
    if (!dateString) {
        return "Non renseigné";
    }

    return new Date(dateString).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short"
    });
}

function escapeHtml(text) {
    if (text === null || text === undefined) {
        return "";
    }

    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeJs(text) {
    if (text === null || text === undefined) {
        return "";
    }

    return String(text)
        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'")
        .replaceAll('"', '\\"')
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r");
}

/*
|--------------------------------------------------------------------------
| Exposition globale
|--------------------------------------------------------------------------
*/

window.api = api;
window.showMessage = showMessage;
window.showSection = showSection;

window.formatDate = formatDate;
window.escapeHtml = escapeHtml;
window.escapeJs = escapeJs;

window.getRoleLabel = getRoleLabel;
window.getUserTeamsText = getUserTeamsText;

window.isAdmin = isAdmin;
window.isManager = isManager;
window.isManagerOrAdmin = isManagerOrAdmin;

/*
|--------------------------------------------------------------------------
| Initialisation
|--------------------------------------------------------------------------
*/

checkAuth();