/*
|--------------------------------------------------------------------------
| Map Boitage - Campagnes / Liste et détail
|--------------------------------------------------------------------------
|
| Fichier : public/campaigns-list.js
|
| Rôle :
| - afficher la liste des campagnes actives
| - afficher le détail d'une campagne
| - afficher la carte Google My Maps dans le détail
| - afficher le bouton Modifier si l'utilisateur a le droit
| - afficher le bouton Supprimer si l'utilisateur a le droit
| - supprimer une campagne active
|
| Dépendances :
| - app.js
| - campaigns-render.js
| - campaigns-modal.js
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Raccourci HTML
|--------------------------------------------------------------------------
*/

const campaignsContainer =
    document.getElementById("campaignsContainer");

/*
|--------------------------------------------------------------------------
| Chargement des campagnes actives
|--------------------------------------------------------------------------
*/

async function loadCampaigns() {
    try {
        const data =
            await api("/api/campaigns");

        if (!data || !campaignsContainer) {
            return;
        }

        currentCampaignId =
            null;

        if (!data.campaigns || data.campaigns.length === 0) {
            campaignsContainer.innerHTML =
                "<p>Aucune campagne active.</p>";
            return;
        }

        campaignsContainer.innerHTML =
            data.campaigns
                .map(campaign => renderCampaignCard(campaign))
                .join("");

    } catch (error) {
        console.error("Erreur loadCampaigns :", error);

        if (campaignsContainer) {
            campaignsContainer.innerHTML =
                `<p class="error">${escapeHtml(error.message)}</p>`;
        }
    }
}

/*
|--------------------------------------------------------------------------
| Affichage d'une carte campagne
|--------------------------------------------------------------------------
*/

function renderCampaignCard(campaign) {
    const campaignId = Number(campaign.id);
    const campaignName = String(campaign.name || "");
    const progress = Number(campaign.progress || 0);
    const validatedSectors = Number(campaign.validated_sectors || 0);
    const totalSectors = Number(campaign.total_sectors || 0);

    // Formatage de la date de création
    const dateCreation = new Date(campaign.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    return `
        <div class="card">
            <h3>
                ${escapeHtml(campaignName)}
            </h3>

            <!-- Ajout des informations Créateur et Date -->
            <p style="font-size: 0.9em; color: #666;">
                <strong>Créée par :</strong> ${escapeHtml(campaign.created_by_name || 'Inconnu')} 
                | <strong>Date :</strong> ${dateCreation}
            </p>

            <p>
                Équipe :
                <strong>
                    ${escapeHtml(campaign.team_name || "Non renseignée")}
                </strong>
            </p>

            <p>
                Progression :
                <strong>${progress}%</strong>
                (${validatedSectors}/${totalSectors} secteurs)
            </p>

            <div class="progress-bar">
                <div
                    class="progress-fill"
                    style="width:${progress}%"
                ></div>
            </div>

            <button
                class="btn btn-primary"
                onclick="loadCampaignDetail(${campaignId})"
            >
                Voir détail
            </button>

            ${
                campaign.can_manage
                    ? `
                        <button
                            class="btn"
                            onclick="openEditCampaign(${campaignId})"
                        >
                            Modifier
                        </button>

                        <button
                            class="btn btn-danger"
                            onclick="deleteCampaign(
                                ${campaignId},
                                '${escapeJs(campaignName)}'
                            )"
                        >
                            Supprimer
                        </button>
                    `
                    : ""
            }
        </div>
    `;
}

/*
|--------------------------------------------------------------------------
| Chargement du détail d'une campagne
|--------------------------------------------------------------------------
*/

async function loadCampaignDetail(campaignId) {
    try {
        currentCampaignId =
            Number(campaignId);

        const data =
            await api(`/api/campaigns/${currentCampaignId}/progress`);

        if (!data || !campaignsContainer) {
            return;
        }

        const campaign =
            data.campaign;

        const cleanCampaignId =
            Number(campaign.id);

        const campaignName =
            String(campaign.name || "");

        campaignsContainer.innerHTML = `
            <div class="card">
                <button
                    class="btn"
                    onclick="loadCampaigns()"
                >
                    ← Retour
                </button>

                ${
                    campaign.can_manage
                        ? `
                            <button
                                class="btn"
                                onclick="openEditCampaign(${cleanCampaignId})"
                            >
                                Modifier
                            </button>

                            <button
                                class="btn btn-danger"
                                onclick="deleteCampaign(
                                    ${cleanCampaignId},
                                    '${escapeJs(campaignName)}'
                                )"
                            >
                                Supprimer
                            </button>
                        `
                        : ""
                }

                <h3>
                    ${escapeHtml(campaignName)}
                </h3>

                <p>
                    Équipe :
                    <strong>
                        ${escapeHtml(campaign.team_name || "Non renseignée")}
                    </strong>
                </p>

                <p>
                    Progression globale :
                    <strong>${Number(campaign.progress || 0)}%</strong>
                    (${Number(campaign.validated_sectors || 0)}/${Number(campaign.total_sectors || 0)} secteurs)
                </p>

                <div class="progress-bar">
                    <div
                        class="progress-fill"
                        style="width:${Number(campaign.progress || 0)}%"
                    ></div>
                </div>
            </div>

            ${
                typeof renderCampaignMap === "function"
                    ? renderCampaignMap()
                    : ""
            }

            ${
                campaign.sectors && campaign.sectors.length
                    ? campaign.sectors
                        .map(sector => renderCampaignSector(sector))
                        .join("")
                    : "<p>Aucun secteur dans cette campagne.</p>"
            }
        `;

    } catch (error) {
        console.error("Erreur loadCampaignDetail :", error);

        showMessage(
            error.message,
            "error"
        );
    }
}

/*
|--------------------------------------------------------------------------
| Suppression d'une campagne
|--------------------------------------------------------------------------
|
| La suppression est protégée côté backend.
| Ici on affiche seulement une confirmation utilisateur.
|
|--------------------------------------------------------------------------
*/

async function deleteCampaign(
    campaignId,
    campaignName
) {
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

        const confirmed =
            confirm(
                `Supprimer définitivement la campagne "${campaignName}" ?`
            );

        if (!confirmed) {
            return;
        }

        await api(
            `/api/campaigns/${cleanCampaignId}`,
            {
                method: "DELETE"
            }
        );

        showMessage(
            "Campagne supprimée."
        );

        currentCampaignId =
            null;

        await loadCampaigns();

    } catch (error) {
        console.error(
            "Erreur suppression campagne :",
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
| Exposition globale
|--------------------------------------------------------------------------
*/

window.loadCampaigns =
    loadCampaigns;

window.renderCampaignCard =
    renderCampaignCard;

window.loadCampaignDetail =
    loadCampaignDetail;

window.deleteCampaign =
    deleteCampaign;