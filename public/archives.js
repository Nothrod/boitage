/*
|--------------------------------------------------------------------------
| Map Boitage - Archives
|--------------------------------------------------------------------------
|
| Fichier : public/archives.js
|
| Rôle :
| Gérer toute la partie archives :
|
| - afficher les campagnes archivées
| - afficher le détail d'une archive
| - afficher les secteurs validés
| - afficher les rues validées
| - afficher les validateurs
| - afficher les dates de validation
| - afficher l'équipe associée
|
| Important :
| Ce fichier utilise des fonctions globales définies dans app.js :
| - api()
| - showMessage()
| - escapeHtml()
| - formatDate()
|
|--------------------------------------------------------------------------
*/

const archivesContainer =
    document.getElementById("archivesContainer");

/*
|--------------------------------------------------------------------------
| Chargement des archives
|--------------------------------------------------------------------------
*/

async function loadArchives() {
    try {
        const data = await api("/api/archives");

        if (!data || !archivesContainer) {
            return;
        }

        if (!data.archives || data.archives.length === 0) {
            archivesContainer.innerHTML =
                "<p>Aucune archive.</p>";

            return;
        }

        archivesContainer.innerHTML = data.archives.map(archive => `
            <div class="card">

                <h3>
                    ${escapeHtml(archive.name)}
                </h3>

                ${
                    archive.team_name
                        ? `
                            <p>
                                Équipe :
                                <strong>
                                    ${escapeHtml(archive.team_name)}
                                </strong>
                            </p>
                        `
                        : ""
                }

                <p>
                    Créée le :
                    ${formatDate(archive.created_at)}
                </p>

                <p>
                    Archivée le :
                    ${formatDate(archive.archived_at)}
                </p>

                <p>
                    Clôturée par :
                    ${escapeHtml(
                        archive.completed_by_name || "Inconnu"
                    )}
                </p>

                <p>
                    Progression :
                    <strong>
                        ${Number(archive.progress || 100)}%
                    </strong>
                </p>

                <button
                    class="btn btn-primary"
                    onclick="loadArchiveDetail(${Number(archive.id)})"
                >
                    Voir détail
                </button>

            </div>
        `).join("");

    } catch (error) {
        console.error("Erreur loadArchives :", error);

        if (archivesContainer) {
            archivesContainer.innerHTML =
                `<p class="error">${escapeHtml(error.message)}</p>`;
        }
    }
}

/*
|--------------------------------------------------------------------------
| Détail d'une archive
|--------------------------------------------------------------------------
*/

async function loadArchiveDetail(id) {
    try {
        const archiveId = Number(id);

        const data = await api(
            `/api/archives/${archiveId}`
        );

        if (!data || !archivesContainer) {
            return;
        }

        const archive = data.archive;

        archivesContainer.innerHTML = `
            <div class="card">

                <button
                    class="btn"
                    onclick="loadArchives()"
                >
                    ← Retour
                </button>

                <h3>
                    ${escapeHtml(archive.name)}
                </h3>

                ${
                    archive.team_name
                        ? `
                            <p>
                                Équipe :
                                <strong>
                                    ${escapeHtml(archive.team_name)}
                                </strong>
                            </p>
                        `
                        : ""
                }

                <p>
                    Créée le :
                    ${formatDate(archive.created_at)}
                </p>

                <p>
                    Archivée le :
                    ${formatDate(archive.archived_at)}
                </p>

                <p>
                    Clôturée par :
                    ${escapeHtml(
                        archive.completed_by_name || "Inconnu"
                    )}
                </p>

                <p>
                    Progression :
                    <strong>
                        ${Number(archive.progress || 100)}%
                    </strong>
                </p>

            </div>

            ${
                archive.sectors &&
                archive.sectors.length
                    ? archive.sectors.map(sector => `
                        <div class="card">

                            <h4>

                                <span
                                    class="color-dot"
                                    style="background:${escapeHtml(
                                        sector.color || "#3388ff"
                                    )}"
                                ></span>

                                ${escapeHtml(sector.name)}

                            </h4>

                            <p>
                                Validé par :
                                ${escapeHtml(
                                    sector.validated_by_name ||
                                    "Utilisateur supprimé"
                                )}
                            </p>

                            <p>
                                Date :
                                ${formatDate(
                                    sector.validated_at
                                )}
                            </p>

                            ${
                                sector.comment
                                    ? `
                                        <p>
                                            Commentaire :
                                            ${escapeHtml(
                                                sector.comment
                                            )}
                                        </p>
                                    `
                                    : ""
                            }

                            ${
                                sector.streets &&
                                sector.streets.length
                                    ? `
                                        <hr>

                                        <h5>
                                            Rues validées
                                        </h5>

                                        <ul>

                                            ${sector.streets.map(street => `
                                                <li>

                                                    ${escapeHtml(
                                                        street.name
                                                    )}

                                                    ${
                                                        street.validated_by_name
                                                            ? `
                                                                <br>
                                                                <small>
                                                                    ${escapeHtml(
                                                                        street.validated_by_name
                                                                    )}
                                                                    -
                                                                    ${formatDate(
                                                                        street.validated_at
                                                                    )}
                                                                </small>
                                                            `
                                                            : ""
                                                    }

                                                </li>
                                            `).join("")}

                                        </ul>
                                    `
                                    : ""
                            }

                        </div>
                    `).join("")
                    : `
                        <p>
                            Aucun détail disponible.
                        </p>
                    `
            }
        `;

    } catch (error) {
        console.error(
            "Erreur loadArchiveDetail :",
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

window.loadArchives =
    loadArchives;

window.loadArchiveDetail =
    loadArchiveDetail;