/*
|--------------------------------------------------------------------------
| Map Boitage - Formulaire d'inscription (page publique)
|--------------------------------------------------------------------------
*/

const registerLink = document.getElementById("registerLink");
const registerForm = document.getElementById("registerForm");
const registerTeamsBox = document.getElementById("registerTeams");
const registerMessageBox = document.getElementById("registerMessage");

function showRegisterMessage(message, type = "success") {
    if (!registerMessageBox) {
        console.log(message);
        return;
    }

    registerMessageBox.textContent = message;
    registerMessageBox.className = "message";

    if (type) {
        registerMessageBox.classList.add(type);
    }
}

async function loadRegisterTeams() {
    try {
        const response = await fetch("/api/teams/public", {
            cache: "no-store"
        });

        const data = await response.json();

        if (!data || !data.teams) {
            return [];
        }

        return data.teams;

    } catch (error) {
        console.error("Erreur loadRegisterTeams :", error);
        return [];
    }
}

function renderRegisterTeamsCheckboxes(teams) {
    if (!registerTeamsBox) {
        return;
    }

    if (!teams || teams.length === 0) {
        registerTeamsBox.innerHTML = '<p class="muted">Aucune équipe disponible.</p>';
        return;
    }

    registerTeamsBox.innerHTML = teams.map(team => {
        return `
            <label class="checkbox-item">
                <input type="checkbox" name="registerTeams" value="${team.id}">
                ${escapeHtml(team.name)}
            </label>
        `;
    }).join("");
}

function getSelectedRegisterTeamIds() {
    if (!registerTeamsBox) {
        return [];
    }

    return Array.from(
        registerTeamsBox.querySelectorAll("input[type='checkbox']:checked")
    ).map(input => Number(input.value));
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
        .replaceAll("'", "&#39;");
}

if (registerLink && registerForm) {
    registerLink.addEventListener("click", async (event) => {
        event.preventDefault();

        const isHidden = registerForm.style.display === "none" || registerForm.style.display === "";

        if (isHidden) {
            const teams = await loadRegisterTeams();
            renderRegisterTeamsCheckboxes(teams);

            registerForm.style.display = "block";
            showRegisterMessage("", "");
        } else {
            registerForm.style.display = "none";
            showRegisterMessage("", "");
        }
    });
}

if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const name = document.getElementById("registerName").value.trim();
        const username = document.getElementById("registerUsername").value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const teamIds = getSelectedRegisterTeamIds();

        if (!name || !username || !email) {
            showRegisterMessage("Tous les champs sont obligatoires.", "error");
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showRegisterMessage("Adresse email invalide.", "error");
            return;
        }

        if (teamIds.length === 0) {
            showRegisterMessage("Vous devez sélectionner au moins une équipe.", "error");
            return;
        }

        try {
            const response = await fetch("/api/register", {
                method: "POST",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name,
                    username,
                    email,
                    teamIds
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                showRegisterMessage(data.message || "Erreur lors de la soumission.", "error");
                return;
            }

            showRegisterMessage(
                data.message || "Votre demande a été soumise avec succès. Vous recevrez un email lors de la validation.",
                "success"
            );

            registerForm.reset();
            registerForm.style.display = "none";

        } catch (error) {
            console.error("Erreur register :", error);
            showRegisterMessage("Erreur de connexion au serveur.", "error");
        }
    });
}