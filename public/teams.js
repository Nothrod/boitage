/*
|--------------------------------------------------------------------------
| Map Boitage - Équipes
|--------------------------------------------------------------------------
|
| Fichier : public/teams.js
|
| Rôle :
| - afficher les équipes
| - ouvrir la popup de création
| - créer une équipe
| - supprimer une équipe
|
|--------------------------------------------------------------------------
*/

const teamsContainer = document.getElementById("teamsContainer");
const createTeamBtn = document.getElementById("createTeamBtn");
const teamModal = document.getElementById("teamModal");
const teamForm = document.getElementById("teamForm");
const teamNameInput = document.getElementById("teamName");
const cancelTeamBtn = document.getElementById("cancelTeamBtn");

/*
|--------------------------------------------------------------------------
| Charger les équipes
|--------------------------------------------------------------------------
*/

async function loadTeams() {
    try {
        const data = await api("/api/teams");

        if (!data || !teamsContainer) {
            return;
        }

        if (!data.teams || data.teams.length === 0) {
            teamsContainer.innerHTML = "<p>Aucune équipe.</p>";
            return;
        }

        teamsContainer.innerHTML = data.teams.map(team => `
            <div class="card team-card">
                <h3>
                    ${escapeHtml(team.name)}
                </h3>

                <p>
                    Créée le :
                    ${formatDate(team.created_at)}
                </p>

                <button
                    class="btn btn-danger"
                    onclick="deleteTeam(${Number(team.id)})"
                >
                    Supprimer
                </button>
            </div>
        `).join("");

    } catch (error) {
        console.error("Erreur loadTeams :", error);

        if (teamsContainer) {
            teamsContainer.innerHTML =
                `<p class="error">${escapeHtml(error.message)}</p>`;
        }
    }
}

/*
|--------------------------------------------------------------------------
| Ouvrir popup équipe
|--------------------------------------------------------------------------
*/

if (createTeamBtn) {
    createTeamBtn.addEventListener("click", () => {
        if (!teamModal) {
            showMessage("Popup équipe introuvable.", "error");
            return;
        }

        teamNameInput.value = "";
        teamModal.classList.remove("hidden");
    });
}

/*
|--------------------------------------------------------------------------
| Annuler popup équipe
|--------------------------------------------------------------------------
*/

if (cancelTeamBtn) {
    cancelTeamBtn.addEventListener("click", () => {
        teamModal.classList.add("hidden");
    });
}

/*
|--------------------------------------------------------------------------
| Fermer popup au clic extérieur
|--------------------------------------------------------------------------
*/

if (teamModal) {
    teamModal.addEventListener("click", event => {
        if (event.target === teamModal) {
            teamModal.classList.add("hidden");
        }
    });
}

/*
|--------------------------------------------------------------------------
| Créer une équipe
|--------------------------------------------------------------------------
*/

if (teamForm) {
    teamForm.addEventListener("submit", async event => {
        event.preventDefault();

        const name = teamNameInput.value.trim();

        if (!name) {
            showMessage("Nom de l'équipe obligatoire.", "error");
            return;
        }

        try {
            await api("/api/teams", {
                method: "POST",
                body: JSON.stringify({ name })
            });

            teamNameInput.value = "";
            teamModal.classList.add("hidden");

            showMessage("Équipe créée.");
            await loadTeams();

        } catch (error) {
            console.error("Erreur création équipe :", error);
            showMessage(error.message, "error");
        }
    });
}

/*
|--------------------------------------------------------------------------
| Supprimer une équipe
|--------------------------------------------------------------------------
*/

async function deleteTeam(id) {
    if (!confirm("Supprimer cette équipe ?")) {
        return;
    }

    try {
        await api(`/api/teams/${Number(id)}`, {
            method: "DELETE"
        });

        showMessage("Équipe supprimée.");
        await loadTeams();

    } catch (error) {
        console.error("Erreur suppression équipe :", error);
        showMessage(error.message, "error");
    }
}

/*
|--------------------------------------------------------------------------
| Exposition globale
|--------------------------------------------------------------------------
*/

window.loadTeams = loadTeams;
window.deleteTeam = deleteTeam;