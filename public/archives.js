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
| Raccourcis HTML - Popup suppression
|--------------------------------------------------------------------------
*/

const deleteArchiveModal =
    document.getElementById("deleteArchiveModal");

const deleteArchiveName =
    document.getElementById("deleteArchiveName");

const cancelDeleteArchiveBtn =
    document.getElementById("cancelDeleteArchiveBtn");

const confirmDeleteArchiveBtn =
    document.getElementById("confirmDeleteArchiveBtn");

let archiveToDeleteId = null;

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

                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <button
                        class="btn btn-primary"
                        onclick="loadArchiveDetail(${Number(archive.id)})"
                    >
                        Voir détail
                    </button>

                    <button
                        class="btn btn-danger"
                        style="background-color: #dc3545; color: white; border: none;"
                        onclick="openDeleteArchiveModal(${Number(archive.id)}, '${escapeHtml(archive.name)}')"
                    >
                        Supprimer
                    </button>
                </div>

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
| Ouverture popup suppression archive
|--------------------------------------------------------------------------
*/

function openDeleteArchiveModal(id, name) {
    if (!deleteArchiveModal) {
        showMessage(
            "Popup de suppression introuvable dans backend.html.",
            "error"
        );
        return;
    }

    archiveToDeleteId = Number(id);

    if (deleteArchiveName) {
        deleteArchiveName.textContent = name || "cette archive";
    }

    deleteArchiveModal.classList.remove("hidden");
}

/*
|--------------------------------------------------------------------------
| Fermeture popup suppression archive
|--------------------------------------------------------------------------
*/

function closeDeleteArchiveModal() {
    if (!deleteArchiveModal) {
        return;
    }

    archiveToDeleteId = null;
    deleteArchiveModal.classList.add("hidden");
}

if (cancelDeleteArchiveBtn) {
    cancelDeleteArchiveBtn.addEventListener(
        "click",
        closeDeleteArchiveModal
    );
}

if (deleteArchiveModal) {
    deleteArchiveModal.addEventListener("click", event => {
        if (event.target === deleteArchiveModal) {
            closeDeleteArchiveModal();
        }
    });
}

/*
|--------------------------------------------------------------------------
| Suppression archive confirmée
|--------------------------------------------------------------------------
*/

async function confirmDeleteArchive() {
    if (!archiveToDeleteId) {
        showMessage(
            "Aucune archive sélectionnée.",
            "error"
        );
        return;
    }

    try {
        if (confirmDeleteArchiveBtn) {
            confirmDeleteArchiveBtn.disabled = true;
            confirmDeleteArchiveBtn.textContent = "Suppression...";
        }

        const data = await api(`/api/archives/${Number(archiveToDeleteId)}`, {
            method: "DELETE"
        });

        closeDeleteArchiveModal();

        if (data && data.success) {
            showMessage(data.message || "Archive supprimée.", "success");
            loadArchives();
        } else {
            showMessage(data?.message || "Erreur lors de la suppression.", "error");
        }

    } catch (error) {
        console.error("Erreur confirmDeleteArchive :", error);
        showMessage(error.message || "Erreur lors de la suppression.", "error");
    } finally {
        if (confirmDeleteArchiveBtn) {
            confirmDeleteArchiveBtn.disabled = false;
            confirmDeleteArchiveBtn.textContent = "Supprimer";
        }
    }
}

if (confirmDeleteArchiveBtn) {
    confirmDeleteArchiveBtn.addEventListener(
        "click",
        confirmDeleteArchive
    );
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

window.openDeleteArchiveModal =
    openDeleteArchiveModal;