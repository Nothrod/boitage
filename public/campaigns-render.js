/*
|--------------------------------------------------------------------------
| Map Boitage - Campagnes / Rendu HTML
|--------------------------------------------------------------------------
|
| Fichier : public/campaigns-render.js
|
| Rôle :
| - afficher la carte Google My Maps d'une campagne
| - afficher un secteur dans le détail d'une campagne
| - afficher les rues d'un secteur
| - afficher l'état validé / non validé
|
| Dépendances :
| - app.js
| - campaigns-validation.js pour validateSector() / validateStreet()
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Carte Google My Maps utilisée pour les campagnes
|--------------------------------------------------------------------------
|
| Important :
| Le lien Google My Maps d'édition :
| https://www.google.com/maps/d/edit?mid=...
|
| doit être transformé en lien d'intégration :
| https://www.google.com/maps/d/embed?mid=...
|
|--------------------------------------------------------------------------
*/

const CAMPAIGN_MAP_URL =
    "https://www.google.com/maps/d/embed?mid=1oGgVRXaWn6GPo4yf9hPcD68wqNub1KIM";

/*
|--------------------------------------------------------------------------
| Affichage de la carte d'une campagne
|--------------------------------------------------------------------------
|
| Cette fonction est exposée globalement pour être appelée depuis le fichier
| qui affiche le détail complet d'une campagne.
|
|--------------------------------------------------------------------------
*/

function renderCampaignMap() {
    return `
        <div class="card campaign-map-card">
            <h3>
                Carte de la campagne
            </h3>

            <div class="campaign-map">
                <iframe
                    src="${CAMPAIGN_MAP_URL}"
                    loading="lazy"
                    allowfullscreen
                    referrerpolicy="no-referrer-when-downgrade">
                </iframe>
            </div>
        </div>
    `;
}

/*
|--------------------------------------------------------------------------
| Affichage d'un secteur dans une campagne
|--------------------------------------------------------------------------
*/

function renderCampaignSector(sector) {
    const sectorId =
        Number(sector.id);

    const validated =
        Boolean(sector.validated_at);

    const streets =
        Array.isArray(sector.streets)
            ? sector.streets
            : [];

    const totalStreets =
        Number(sector.total_streets || streets.length || 0);

    const validatedStreets =
        Number(sector.validated_streets || 0);

    const streetsProgress =
        Number(sector.streets_progress || 0);

    return `
        <div class="card sector-card">
            <h4>
                <span
                    class="color-dot"
                    style="background:${escapeHtml(sector.color || "#3388ff")}"
                ></span>

                ${escapeHtml(sector.name)}
            </h4>

            ${
                totalStreets > 0
                    ? `
                        <p>
                            Rues :
                            <strong>${validatedStreets}/${totalStreets}</strong>
                            (${streetsProgress}%)
                        </p>

                        <div class="progress-bar">
                            <div
                                class="progress-fill"
                                style="width:${streetsProgress}%"
                            ></div>
                        </div>
                    `
                    : `
                        <p>
                            Aucune rue renseignée pour ce secteur.
                        </p>
                    `
            }

            ${
                validated
                    ? renderValidatedSector(sector)
                    : renderPendingSector(sectorId, streets)
            }
        </div>
    `;
}

/*
|--------------------------------------------------------------------------
| Affichage d'un secteur déjà validé
|--------------------------------------------------------------------------
*/

function renderValidatedSector(sector) {
    return `
        <p class="success">
            Secteur validé par
            ${escapeHtml(sector.validated_by_name || "Utilisateur supprimé")}
            le ${formatDate(sector.validated_at)}
        </p>

        ${
            sector.comment
                ? `
                    <p>
                        Commentaire secteur :
                        ${escapeHtml(sector.comment)}
                    </p>
                `
                : ""
        }

        ${renderStreetList(sector.streets || [], true)}
    `;
}

/*
|--------------------------------------------------------------------------
| Affichage d'un secteur non validé
|--------------------------------------------------------------------------
*/

function renderPendingSector(sectorId, streets) {
    return `
        ${
            streets && streets.length
                ? renderStreetList(streets, false)
                : ""
        }

        <textarea
            id="comment-sector-${Number(sectorId)}"
            placeholder="Commentaire optionnel pour tout le secteur"
        ></textarea>

        <button
            class="btn btn-primary"
            onclick="validateSector(${Number(sectorId)})"
        >
            Valider tout le secteur
        </button>
    `;
}

/*
|--------------------------------------------------------------------------
| Affichage de la liste des rues
|--------------------------------------------------------------------------
*/

function renderStreetList(streets, sectorAlreadyValidated) {
    if (!streets || streets.length === 0) {
        return "";
    }

    return `
        <div class="street-list">
            <h5>
                Rues du secteur
            </h5>

            ${
                streets
                    .map(street => renderStreet(street, sectorAlreadyValidated))
                    .join("")
            }
        </div>
    `;
}

/*
|--------------------------------------------------------------------------
| Affichage d'une rue
|--------------------------------------------------------------------------
*/

function renderStreet(street, sectorAlreadyValidated) {
    const streetId =
        Number(street.id);

    const validated =
        Boolean(street.validated_at);

    return `
        <div class="street-item">
            <p>
                ${validated ? "✅" : "⬜"}
                <strong>${escapeHtml(street.name)}</strong>
            </p>

            ${
                validated
                    ? `
                        <p class="success">
                            Validée par
                            ${escapeHtml(street.validated_by_name || "Utilisateur supprimé")}
                            le ${formatDate(street.validated_at)}
                        </p>

                        ${
                            street.comment
                                ? `
                                    <p>
                                        Commentaire rue :
                                        ${escapeHtml(street.comment)}
                                    </p>
                                `
                                : ""
                        }
                    `
                    : sectorAlreadyValidated
                        ? ""
                        : `
                            <textarea
                                id="comment-street-${streetId}"
                                placeholder="Commentaire optionnel pour cette rue"
                            ></textarea>

                            <button
                                class="btn"
                                onclick="validateStreet(${streetId})"
                            >
                                Valider cette rue
                            </button>
                        `
            }
        </div>
    `;
}

/*
|--------------------------------------------------------------------------
| Exposition globale
|--------------------------------------------------------------------------
*/

window.renderCampaignMap =
    renderCampaignMap;

window.renderCampaignSector =
    renderCampaignSector;

window.renderValidatedSector =
    renderValidatedSector;

window.renderPendingSector =
    renderPendingSector;

window.renderStreetList =
    renderStreetList;

window.renderStreet =
    renderStreet;