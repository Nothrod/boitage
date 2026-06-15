/*
|--------------------------------------------------------------------------
| Map Boitage - Campagnes / Popup création et modification
|--------------------------------------------------------------------------
|
| Fichier : public/campaigns-modal.js
|
| Rôle :
| - ouvrir le popup de création de campagne
| - ouvrir le popup de modification de campagne
| - charger les équipes disponibles
| - charger les secteurs selon l'équipe choisie
| - créer une campagne
| - modifier une campagne existante
|
| Dépendances :
| - app.js
| - campaigns-list.js pour loadCampaigns()
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Raccourcis HTML
|--------------------------------------------------------------------------
*/

const createCampaignBtn =
    document.getElementById("createCampaignBtn");

const campaignModal =
    document.getElementById("campaignModal");

const campaignModalTitle =
    document.getElementById("campaignModalTitle");

const campaignEditId =
    document.getElementById("campaignEditId");

const campaignForm =
    document.getElementById("campaignForm");

const campaignNameInput =
    document.getElementById("campaignName");

const campaignTeamInput =
    document.getElementById("campaignTeam");

const campaignSectorsBox =
    document.getElementById("campaignSectors");

const cancelCampaignBtn =
    document.getElementById("cancelCampaignBtn");

const saveCampaignBtn =
    document.getElementById("saveCampaignBtn");

/*
|--------------------------------------------------------------------------
| Chargement des équipes dans le popup campagne
|--------------------------------------------------------------------------
*/

async function loadCampaignTeams() {
    if (!campaignTeamInput) {
        return [];
    }

    campaignTeamInput.innerHTML = `
        <option value="">
            Chargement...
        </option>
    `;

    let data = null;

    if (
        window.currentUser &&
        window.currentUser.role === "admin"
    ) {
        data = await api("/api/users/teams");
    } else {
        data = await api("/api/users/me/teams");
    }

    campaignTeamInput.innerHTML = `
        <option value="">
            Sélectionner une équipe
        </option>
    `;

    if (!data || !data.teams || data.teams.length === 0) {
        campaignTeamInput.innerHTML += `
            <option value="" disabled>
                Aucune équipe disponible
            </option>
        `;

        return [];
    }

    data.teams.forEach(team => {
        campaignTeamInput.innerHTML += `
            <option value="${Number(team.id)}">
                ${escapeHtml(team.name)}
            </option>
        `;
    });

    if (
        window.currentUser &&
        window.currentUser.role === "manager" &&
        data.teams.length === 1
    ) {
        campaignTeamInput.value =
            String(data.teams[0].id);
    }

    return data.teams;
}

/*
|--------------------------------------------------------------------------
| Chargement des secteurs selon l'équipe
|--------------------------------------------------------------------------
*/

async function loadCampaignSectors(teamId = null) {
    if (!campaignSectorsBox) {
        return;
    }

    const cleanTeamId =
        teamId ? Number(teamId) : 0;

    if (!cleanTeamId) {
        campaignSectorsBox.innerHTML =
            "<p>Sélectionne une équipe pour afficher les secteurs.</p>";
        return;
    }

    campaignSectorsBox.innerHTML =
        "Chargement...";

    const data =
        await api(`/api/sectors?teamId=${cleanTeamId}`);

    if (!data || !data.sectors || data.sectors.length === 0) {
        campaignSectorsBox.innerHTML =
            "<p>Aucun secteur disponible pour cette équipe.</p>";
        return;
    }

    campaignSectorsBox.innerHTML =
        data.sectors.map(sector => `
            <label class="checkbox-item">
                <input
                    type="checkbox"
                    value="${Number(sector.id)}"
                >

                ${escapeHtml(sector.name)}
            </label>
        `).join("");
}

/*
|--------------------------------------------------------------------------
| Réinitialisation popup en mode création
|--------------------------------------------------------------------------
*/

function resetCampaignModalForCreate() {
    if (campaignEditId) {
        campaignEditId.value = "";
    }

    if (campaignModalTitle) {
        campaignModalTitle.textContent =
            "Nouvelle campagne";
    }

    if (saveCampaignBtn) {
        saveCampaignBtn.textContent =
            "Créer";
    }

    if (campaignNameInput) {
        campaignNameInput.value = "";
    }

    if (campaignTeamInput) {
        campaignTeamInput.disabled = false;
        campaignTeamInput.value = "";
    }

    if (campaignSectorsBox) {
        campaignSectorsBox.innerHTML =
            "<p>Sélectionne une équipe pour afficher les secteurs.</p>";
    }
}

/*
|--------------------------------------------------------------------------
| Ouverture popup création
|--------------------------------------------------------------------------
*/

async function openCreateCampaign() {
    try {
        if (!campaignModal) {
            return;
        }

        resetCampaignModalForCreate();

        await loadCampaignTeams();

        if (
            campaignTeamInput &&
            campaignTeamInput.value
        ) {
            await loadCampaignSectors(
                Number(campaignTeamInput.value)
            );
        }

        campaignModal.classList.remove("hidden");

    } catch (error) {
        console.error(
            "Erreur ouverture création campagne :",
            error
        );

        showMessage(
            error.message,
            "error"
        );
    }
}

/*
|--------------------------------------------------------------------------
| Ouverture popup modification
|--------------------------------------------------------------------------
*/

async function openEditCampaign(campaignId) {
    try {
        const cleanCampaignId =
            Number(campaignId);

        if (!cleanCampaignId) {
            showMessage(
                "Campagne invalide.",
                "error"
            );
            return;
        }

        const data =
            await api(`/api/campaigns/${cleanCampaignId}/progress`);

        if (!data || !data.campaign) {
            return;
        }

        const campaign =
            data.campaign;

        if (!campaign.can_manage) {
            showMessage(
                "Vous ne pouvez pas modifier cette campagne.",
                "error"
            );
            return;
        }

        if (campaignEditId) {
            campaignEditId.value =
                String(campaign.id);
        }

        if (campaignNameInput) {
            campaignNameInput.value =
                campaign.name || "";
        }

        if (campaignModalTitle) {
            campaignModalTitle.textContent =
                "Modifier la campagne";
        }

        if (saveCampaignBtn) {
            saveCampaignBtn.textContent =
                "Enregistrer";
        }

        await loadCampaignTeams();

        if (campaignTeamInput) {
            campaignTeamInput.value =
                String(campaign.team_id);

            /*
            |--------------------------------------------------------------------------
            | On bloque le changement d'équipe en modification
            |--------------------------------------------------------------------------
            |
            | Pour éviter de déplacer une campagne d'une équipe vers une autre.
            | Ici on modifie uniquement :
            | - le nom
            | - les secteurs
            |
            |--------------------------------------------------------------------------
            */

            campaignTeamInput.disabled = true;
        }

        await loadCampaignSectors(
            campaign.team_id
        );

        const selectedSectorIds =
            Array.isArray(campaign.sectors)
                ? campaign.sectors.map(sector => Number(sector.id))
                : [];

        campaignSectorsBox
            ?.querySelectorAll("input[type='checkbox']")
            .forEach(input => {
                input.checked =
                    selectedSectorIds.includes(
                        Number(input.value)
                    );
            });

        if (campaignModal) {
            campaignModal.classList.remove("hidden");
        }

    } catch (error) {
        console.error(
            "Erreur ouverture modification campagne :",
            error
        );

        showMessage(
            error.message,
            "error"
        );
    }
}

/*
|--------------------------------------------------------------------------
| Changement d'équipe dans le popup
|--------------------------------------------------------------------------
*/

if (campaignTeamInput) {
    campaignTeamInput.addEventListener("change", async () => {
        try {
            const teamId =
                Number(campaignTeamInput.value);

            await loadCampaignSectors(teamId);

        } catch (error) {
            console.error(
                "Erreur changement équipe campagne :",
                error
            );

            showMessage(
                error.message,
                "error"
            );
        }
    });
}

/*
|--------------------------------------------------------------------------
| Bouton création campagne
|--------------------------------------------------------------------------
*/

if (createCampaignBtn) {
    createCampaignBtn.addEventListener("click", () => {
        openCreateCampaign();
    });
}

/*
|--------------------------------------------------------------------------
| Fermeture popup campagne
|--------------------------------------------------------------------------
*/

if (cancelCampaignBtn && campaignModal) {
    cancelCampaignBtn.addEventListener("click", () => {
        campaignModal.classList.add("hidden");
    });
}

if (campaignModal) {
    campaignModal.addEventListener("click", event => {
        if (event.target === campaignModal) {
            campaignModal.classList.add("hidden");
        }
    });
}

/*
|--------------------------------------------------------------------------
| Soumission formulaire création / modification
|--------------------------------------------------------------------------
*/

if (campaignForm) {
    campaignForm.addEventListener("submit", async event => {
        event.preventDefault();

        try {
            const name =
                campaignNameInput
                    ? campaignNameInput.value.trim()
                    : "";

            const teamId =
                campaignTeamInput
                    ? Number(campaignTeamInput.value)
                    : 0;

            const sectorIds =
                campaignSectorsBox
                    ? Array.from(
                        campaignSectorsBox.querySelectorAll("input:checked")
                    ).map(input => Number(input.value))
                    : [];

            const editId =
                campaignEditId
                    ? Number(campaignEditId.value)
                    : 0;

            if (!name) {
                showMessage(
                    "Nom de campagne obligatoire.",
                    "error"
                );
                return;
            }

            if (!editId && !teamId) {
                showMessage(
                    "Sélectionne une équipe.",
                    "error"
                );
                return;
            }

            if (sectorIds.length === 0) {
                showMessage(
                    "Sélectionne au moins un secteur.",
                    "error"
                );
                return;
            }

            if (editId) {
                await api(`/api/campaigns/${editId}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        name,
                        sectorIds
                    })
                });

                showMessage(
                    "Campagne modifiée."
                );
            } else {
                await api("/api/campaigns", {
                    method: "POST",
                    body: JSON.stringify({
                        name,
                        teamId,
                        sectorIds
                    })
                });

                showMessage(
                    "Campagne créée."
                );
            }

            if (campaignModal) {
                campaignModal.classList.add("hidden");
            }

            resetCampaignModalForCreate();

            showSection("campaigns");

        } catch (error) {
            console.error(
                "Erreur sauvegarde campagne :",
                error
            );

            showMessage(
                error.message,
                "error"
            );
        }
    });
}

/*
|--------------------------------------------------------------------------
| Exposition globale
|--------------------------------------------------------------------------
*/

window.openCreateCampaign =
    openCreateCampaign;

window.openEditCampaign =
    openEditCampaign;

window.loadCampaignTeams =
    loadCampaignTeams;

window.loadCampaignSectors =
    loadCampaignSectors;