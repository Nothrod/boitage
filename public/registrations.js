/*
|--------------------------------------------------------------------------
| Map Boitage - Gestion des demandes d'inscription (Admin)
|--------------------------------------------------------------------------
*/

const registrationsContainer = document.getElementById("registrationsContainer");

async function loadRegistrations() {
    if (!registrationsContainer) {
        return;
    }

    try {
        const data = await api("/api/registrations");

        if (!data || !data.registrations) {
            registrationsContainer.innerHTML = "<p>Aucune demande.</p>";
            return;
        }

        const registrations = data.registrations;

        if (!registrations.length) {
            registrationsContainer.innerHTML = "<p>Aucune demande d'inscription.</p>";
            return;
        }

        registrationsContainer.innerHTML = registrations.map(reg => {
            const statusBadge = getStatusBadge(reg.status);
            const teamsText = reg.teams && reg.teams.length > 0
                ? reg.teams.map(t => escapeHtml(t.name)).join(", ")
                : "Aucune équipe";

            const processedInfo = reg.processedByUser
                ? `Traité par : ${escapeHtml(reg.processedByUser.name)} (${escapeHtml(reg.processedByUser.username)}) le ${formatDate(reg.processed_at)}`
                : "";

            const actions = reg.status === "pending" ? `
                <button class="btn btn-success" onclick="approveRegistration(${reg.id})">
                    Approuver
                </button>
                <button class="btn btn-danger" onclick="rejectRegistration(${reg.id})">
                    Rejeter
                </button>
            ` : "";

            return `
                <div class="card registration-card">
                    <div class="registration-header">
                        <h4>${escapeHtml(reg.name)}</h4>
                        ${statusBadge}
                    </div>
                    <p><strong>Identifiant :</strong> ${escapeHtml(reg.username)}</p>
                    <p><strong>Email :</strong> ${escapeHtml(reg.email)}</p>
                    <p><strong>Équipe(s) :</strong> ${teamsText}</p>
                    <p><strong>Demandé le :</strong> ${formatDate(reg.created_at)}</p>
                    ${processedInfo ? `<p class="muted">${processedInfo}</p>` : ""}
                    <div class="registration-actions">
                        ${actions}
                    </div>
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("Erreur loadRegistrations :", error);
        registrationsContainer.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    }
}

function getStatusBadge(status) {
    if (status === "pending") {
        return '<span class="badge badge-waiting">En attente</span>';
    }
    if (status === "approved") {
        return '<span class="badge badge-active">Approuvée</span>';
    }
    if (status === "rejected") {
        return '<span class="badge badge-admin">Rejetée</span>';
    }
    return '<span class="badge">' + escapeHtml(status) + '</span>';
}

async function approveRegistration(id) {
    if (!confirm("Approuver cette demande d'inscription ?")) {
        return;
    }

    try {
        const data = await api(`/api/registrations/${id}/approve`, {
            method: "POST"
        });

        if (data && data.success) {
            showMessage(data.message || "Demande approuvée.");
            
            if (data.activationLink) {
                setTimeout(() => {
                    showMessage(
                        "Lien d'activation : " + data.activationLink + " (à envoyer par email)",
                        "info"
                    );
                }, 100);
            }
            
            await loadRegistrations();
        }

    } catch (error) {
        console.error("Erreur approveRegistration :", error);
        showMessage(error.message, "error");
    }
}

async function rejectRegistration(id) {
    if (!confirm("Rejeter cette demande d'inscription ?")) {
        return;
    }

    try {
        const data = await api(`/api/registrations/${id}/reject`, {
            method: "POST"
        });

        if (data && data.success) {
            showMessage(data.message || "Demande rejetée.");
            await loadRegistrations();
        }

    } catch (error) {
        console.error("Erreur rejectRegistration :", error);
        showMessage(error.message, "error");
    }
}

window.loadRegistrations = loadRegistrations;
window.approveRegistration = approveRegistration;
window.rejectRegistration = rejectRegistration;