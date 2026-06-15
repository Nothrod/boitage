/*
|--------------------------------------------------------------------------
| Map Boitage - Campagnes / Validations
|--------------------------------------------------------------------------
|
| Fichier : public/campaigns-validation.js
|
| Rôle :
| - valider un secteur entier
| - valider une rue individuellement
| - recharger la campagne après validation
| - revenir à la liste si la campagne est archivée automatiquement
|
| Dépendances :
| - app.js
| - campaigns-list.js pour loadCampaigns() / loadCampaignDetail()
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Validation d'un secteur entier
|--------------------------------------------------------------------------
*/

async function validateSector(sectorId) {
    try {
        const cleanSectorId =
            Number(sectorId);

        if (!window.currentCampaignId || !cleanSectorId) {
            showMessage(
                "Campagne ou secteur invalide.",
                "error"
            );
            return;
        }

        const commentInput =
            document.getElementById(
                `comment-sector-${cleanSectorId}`
            );

        const comment =
            commentInput
                ? commentInput.value.trim()
                : "";

        const data =
            await api(
                `/api/campaigns/${window.currentCampaignId}/validate/${cleanSectorId}`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        comment
                    })
                }
            );

        if (!data) {
            return;
        }

        showMessage(
            data.message || "Secteur validé."
        );

        if (
            data.progress &&
            data.progress.archived
        ) {
            await loadCampaigns();
        } else {
            await loadCampaignDetail(
                window.currentCampaignId
            );
        }

    } catch (error) {
        console.error(
            "Erreur validateSector :",
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
| Validation d'une rue
|--------------------------------------------------------------------------
*/

async function validateStreet(streetId) {
    try {
        const cleanStreetId =
            Number(streetId);

        if (!window.currentCampaignId || !cleanStreetId) {
            showMessage(
                "Campagne ou rue invalide.",
                "error"
            );
            return;
        }

        const commentInput =
            document.getElementById(
                `comment-street-${cleanStreetId}`
            );

        const comment =
            commentInput
                ? commentInput.value.trim()
                : "";

        const data =
            await api(
                `/api/campaigns/${window.currentCampaignId}/validate-street/${cleanStreetId}`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        comment
                    })
                }
            );

        if (!data) {
            return;
        }

        showMessage(
            data.message || "Rue validée."
        );

        if (
            data.campaign_progress &&
            data.campaign_progress.archived
        ) {
            await loadCampaigns();
        } else {
            await loadCampaignDetail(
                window.currentCampaignId
            );
        }

    } catch (error) {
        console.error(
            "Erreur validateStreet :",
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

window.validateSector =
    validateSector;

window.validateStreet =
    validateStreet;