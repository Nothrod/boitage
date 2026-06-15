/*
|--------------------------------------------------------------------------
| Map Boitage - Secteurs
|--------------------------------------------------------------------------
|
| Fichier : public/sectors.js
|
| Rôle :
| Gérer toute la partie secteurs :
| - afficher les secteurs
| - afficher les rues liées aux secteurs
| - créer un secteur
| - modifier un secteur
| - demander confirmation avant suppression
| - supprimer un secteur
|
| Important :
| Ce fichier utilise des fonctions globales définies dans app.js :
| - api()
| - showMessage()
| - escapeHtml()
| - showSection()
| - isAdmin()
|
| Il doit donc être chargé APRÈS app.js dans backend.html.
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| État local
|--------------------------------------------------------------------------
*/

let editingSectorId = null;
let sectorToDeleteId = null;

/*
|--------------------------------------------------------------------------
| Raccourcis HTML
|--------------------------------------------------------------------------
*/

const sectorsContainer =
    document.getElementById("sectorsContainer");

const createSectorBtn =
    document.getElementById("createSectorBtn");

const sectorModal =
    document.getElementById("sectorModal");

const sectorForm =
    document.getElementById("sectorForm");

const sectorNameInput =
    document.getElementById("sectorName");

const sectorColorInput =
    document.getElementById("sectorColor");

const sectorStreetsInput =
    document.getElementById("sectorStreets");

const cancelSectorBtn =
    document.getElementById("cancelSectorBtn");

/*
|--------------------------------------------------------------------------
| Raccourcis HTML - Popup suppression
|--------------------------------------------------------------------------
*/

const deleteSectorModal =
    document.getElementById("deleteSectorModal");

const deleteSectorName =
    document.getElementById("deleteSectorName");

const cancelDeleteSectorBtn =
    document.getElementById("cancelDeleteSectorBtn");

const confirmDeleteSectorBtn =
    document.getElementById("confirmDeleteSectorBtn");

/*
|--------------------------------------------------------------------------
| Sécurité JS pour injection dans onclick
|--------------------------------------------------------------------------
*/

function escapeJs(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, "&quot;")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "");
}

/*
|--------------------------------------------------------------------------
| Chargement des secteurs
|--------------------------------------------------------------------------
*/

async function loadSectors() {
    try {
        const data = await api("/api/sectors");

        if (!data || !sectorsContainer) {
            return;
        }

        if (!data.sectors || data.sectors.length === 0) {
            sectorsContainer.innerHTML =
                "<p>Aucun secteur.</p>";
            return;
        }

        sectorsContainer.innerHTML = data.sectors.map(sector => {
            const streetsText =
                sector.streets && sector.streets.length
                    ? sector.streets
                        .map(street => escapeHtml(street.name))
                        .join(", ")
                    : "Aucune rue";

            const streetsForJs =
                sector.streets && sector.streets.length
                    ? sector.streets
                        .map(street => street.name)
                        .join("\n")
                    : "";

            const adminButtons =
                typeof isAdmin === "function" && isAdmin()
                    ? `
                        <div class="card-actions">
                            <button
                                class="btn"
                                onclick="openEditSectorModal(
                                    ${Number(sector.id)},
                                    '${escapeJs(sector.name)}',
                                    '${escapeJs(sector.color || "#3388ff")}',
                                    '${escapeJs(streetsForJs)}'
                                )"
                            >
                                Modifier
                            </button>

                            <button
                                class="btn btn-danger"
                                onclick="openDeleteSectorModal(
                                    ${Number(sector.id)},
                                    '${escapeJs(sector.name)}'
                                )"
                            >
                                Supprimer
                            </button>
                        </div>
                    `
                    : "";

            return `
                <div class="card">
                    <h3>
                        <span
                            class="color-dot"
                            style="background:${escapeHtml(sector.color || "#3388ff")}"
                        ></span>

                        ${escapeHtml(sector.name)}
                    </h3>

                    <p>
                        Rues :
                        ${streetsText}
                    </p>

                    ${adminButtons}
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("Erreur loadSectors :", error);

        if (sectorsContainer) {
            sectorsContainer.innerHTML =
                `<p class="error">${escapeHtml(error.message)}</p>`;
        }
    }
}

/*
|--------------------------------------------------------------------------
| Ouverture popup création secteur
|--------------------------------------------------------------------------
*/

function openCreateSectorModal() {
    if (!sectorModal) {
        showMessage(
            "Popup secteur introuvable dans backend.html.",
            "error"
        );

        return;
    }

    editingSectorId = null;

    sectorNameInput.value = "";
    sectorColorInput.value = "#3388ff";
    sectorStreetsInput.value = "";

    sectorModal.classList.remove("hidden");
}

if (createSectorBtn) {
    createSectorBtn.addEventListener("click", openCreateSectorModal);
}

/*
|--------------------------------------------------------------------------
| Ouverture popup modification secteur
|--------------------------------------------------------------------------
*/

function openEditSectorModal(id, name, color, streets) {
    if (!sectorModal) {
        showMessage(
            "Popup secteur introuvable dans backend.html.",
            "error"
        );

        return;
    }

    if (typeof isAdmin === "function" && !isAdmin()) {
        showMessage(
            "Accès réservé aux administrateurs.",
            "error"
        );

        return;
    }

    editingSectorId = Number(id);

    sectorNameInput.value = name || "";
    sectorColorInput.value = color || "#3388ff";
    sectorStreetsInput.value = streets || "";

    sectorModal.classList.remove("hidden");
}

/*
|--------------------------------------------------------------------------
| Fermeture popup secteur
|--------------------------------------------------------------------------
*/

function closeSectorModal() {
    if (!sectorModal) {
        return;
    }

    editingSectorId = null;

    sectorModal.classList.add("hidden");
}

if (cancelSectorBtn) {
    cancelSectorBtn.addEventListener("click", closeSectorModal);
}

/*
|--------------------------------------------------------------------------
| Fermeture popup secteur au clic extérieur
|--------------------------------------------------------------------------
*/

if (sectorModal) {
    sectorModal.addEventListener("click", event => {
        if (event.target === sectorModal) {
            closeSectorModal();
        }
    });
}

/*
|--------------------------------------------------------------------------
| Création / modification secteur
|--------------------------------------------------------------------------
*/

if (sectorForm) {
    sectorForm.addEventListener("submit", async event => {
        event.preventDefault();

        const name =
            sectorNameInput.value.trim();

        const color =
            sectorColorInput.value || "#3388ff";

        const streets =
            sectorStreetsInput.value
                .split("\n")
                .map(street => street.trim())
                .filter(Boolean);

        if (!name) {
            showMessage(
                "Le nom du secteur est obligatoire.",
                "error"
            );

            return;
        }

        try {
            if (editingSectorId) {
                await api(`/api/sectors/${editingSectorId}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        name,
                        color,
                        streets
                    })
                });

                showMessage("Secteur modifié.");

            } else {
                await api("/api/sectors", {
                    method: "POST",
                    body: JSON.stringify({
                        name,
                        color,
                        streets
                    })
                });

                showMessage("Secteur créé.");
            }

            closeSectorModal();

            await loadSectors();

        } catch (error) {
            console.error("Erreur sauvegarde secteur :", error);
            showMessage(error.message, "error");
        }
    });
}

/*
|--------------------------------------------------------------------------
| Ouverture popup suppression secteur
|--------------------------------------------------------------------------
*/

function openDeleteSectorModal(id, name) {
    if (typeof isAdmin === "function" && !isAdmin()) {
        showMessage(
            "Accès réservé aux administrateurs.",
            "error"
        );

        return;
    }

    if (!deleteSectorModal) {
        showMessage(
            "Popup de suppression introuvable dans backend.html.",
            "error"
        );

        return;
    }

    sectorToDeleteId = Number(id);

    if (deleteSectorName) {
        deleteSectorName.textContent = name || "ce secteur";
    }

    deleteSectorModal.classList.remove("hidden");
}

/*
|--------------------------------------------------------------------------
| Fermeture popup suppression secteur
|--------------------------------------------------------------------------
*/

function closeDeleteSectorModal() {
    if (!deleteSectorModal) {
        return;
    }

    sectorToDeleteId = null;

    deleteSectorModal.classList.add("hidden");
}

if (cancelDeleteSectorBtn) {
    cancelDeleteSectorBtn.addEventListener(
        "click",
        closeDeleteSectorModal
    );
}

if (deleteSectorModal) {
    deleteSectorModal.addEventListener("click", event => {
        if (event.target === deleteSectorModal) {
            closeDeleteSectorModal();
        }
    });
}

/*
|--------------------------------------------------------------------------
| Suppression secteur confirmée
|--------------------------------------------------------------------------
*/

async function confirmDeleteSector() {
    if (!sectorToDeleteId) {
        showMessage(
            "Aucun secteur sélectionné.",
            "error"
        );

        return;
    }

    try {
        if (confirmDeleteSectorBtn) {
            confirmDeleteSectorBtn.disabled = true;
            confirmDeleteSectorBtn.textContent = "Suppression...";
        }

        await api(`/api/sectors/${Number(sectorToDeleteId)}`, {
            method: "DELETE"
        });

        closeDeleteSectorModal();

        showMessage("Secteur supprimé.");

        await loadSectors();

    } catch (error) {
        console.error("Erreur confirmDeleteSector :", error);
        showMessage(error.message, "error");

    } finally {
        if (confirmDeleteSectorBtn) {
            confirmDeleteSectorBtn.disabled = false;
            confirmDeleteSectorBtn.textContent = "Supprimer";
        }
    }
}

if (confirmDeleteSectorBtn) {
    confirmDeleteSectorBtn.addEventListener(
        "click",
        confirmDeleteSector
    );
}

/*
|--------------------------------------------------------------------------
| Ancienne fonction conservée par sécurité
|--------------------------------------------------------------------------
|
| Si un vieux bouton appelle encore deleteSector(id),
| on redirige vers la nouvelle popup.
|
|--------------------------------------------------------------------------
*/

function deleteSector(id) {
    openDeleteSectorModal(id, "ce secteur");
}

/*
|--------------------------------------------------------------------------
| Exposition globale
|--------------------------------------------------------------------------
*/

window.loadSectors = loadSectors;
window.deleteSector = deleteSector;
window.openCreateSectorModal = openCreateSectorModal;
window.openEditSectorModal = openEditSectorModal;
window.openDeleteSectorModal = openDeleteSectorModal;