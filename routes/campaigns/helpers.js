/*
|--------------------------------------------------------------------------
| Map Boitage - Campagnes / Helpers
|--------------------------------------------------------------------------
|
| Fichier : routes/campaigns/helpers.js
|
| Rôle :
| Regrouper les fonctions communes aux routes campagnes.
|
| Utilisé par :
| - list.js
| - create.js
| - update.js
| - delete.js
| - validate-sector.js
| - validate-street.js
| - sectors.js
|
|--------------------------------------------------------------------------
*/

const db = require("../../db/db");

const {
    getSessionTeamIds,
    userCanManageTeam
} = require("../../middleware/auth");

/*
|--------------------------------------------------------------------------
| Vérifie si l'utilisateur peut accéder à une campagne
|--------------------------------------------------------------------------
|
| Admin :
| - accès à toutes les campagnes
|
| Manager / User :
| - accès uniquement aux campagnes de ses équipes
|
|--------------------------------------------------------------------------
*/

function canAccessCampaign(req, campaign) {
    if (!req.session || !req.session.user || !campaign) {
        return false;
    }

    if (req.session.user.role === "admin") {
        return true;
    }

    const teamIds =
        getSessionTeamIds(req);

    return teamIds.includes(
        Number(campaign.team_id)
    );
}

/*
|--------------------------------------------------------------------------
| Vérifie si l'utilisateur peut gérer une campagne
|--------------------------------------------------------------------------
|
| Admin :
| - peut gérer toutes les campagnes
|
| Manager :
| - peut gérer uniquement les campagnes de ses équipes
|
| User :
| - ne peut gérer aucune campagne
|
|--------------------------------------------------------------------------
*/

function canManageCampaign(req, campaign) {
    if (!req.session || !req.session.user || !campaign) {
        return false;
    }

    if (req.session.user.role === "admin") {
        return true;
    }

    return userCanManageTeam(
        req,
        campaign.team_id
    );
}

/*
|--------------------------------------------------------------------------
| Vérifie si l'utilisateur peut créer une campagne pour une équipe
|--------------------------------------------------------------------------
|
| Admin :
| - peut créer pour toutes les équipes
|
| Manager :
| - peut créer uniquement pour ses équipes
|
|--------------------------------------------------------------------------
*/

function canCreateCampaignForTeam(req, teamId) {
    if (!req.session || !req.session.user) {
        return false;
    }

    if (req.session.user.role === "admin") {
        return true;
    }

    return userCanManageTeam(
        req,
        teamId
    );
}

/*
|--------------------------------------------------------------------------
| Charge une campagne par ID
|--------------------------------------------------------------------------
*/

function getCampaignById(campaignId) {
    return db.prepare(`
        SELECT
            id,
            name,
            team_id,
            archived,
            archived_at,
            created_by,
            completed_by,
            created_at,
            updated_at
        FROM campaigns
        WHERE id = ?
    `).get(
        campaignId
    );
}

/*
|--------------------------------------------------------------------------
| Nettoyage d'une liste d'IDs de secteurs
|--------------------------------------------------------------------------
|
| Objectif :
| - convertir en Number
| - supprimer les valeurs invalides
| - supprimer les doublons
|
|--------------------------------------------------------------------------
*/

function cleanSectorIds(sectorIds) {
    return [
        ...new Set(
            Array.isArray(sectorIds)
                ? sectorIds
                    .map(id => Number(id))
                    .filter(id => id > 0)
                : []
        )
    ];
}

/*
|--------------------------------------------------------------------------
| Vérifie que tous les secteurs existent
|--------------------------------------------------------------------------
*/

function validateExistingSectors(sectorIds) {
    if (!Array.isArray(sectorIds) || sectorIds.length === 0) {
        return false;
    }

    const placeholders =
        sectorIds.map(() => "?").join(",");

    const existingSectors =
        db.prepare(`
            SELECT id
            FROM sectors
            WHERE id IN (${placeholders})
        `).all(
            ...sectorIds
        );

    return existingSectors.length === sectorIds.length;
}

/*
|--------------------------------------------------------------------------
| Calcule la progression d'une campagne
|--------------------------------------------------------------------------
*/

function getCampaignProgress(campaignId) {
    const total =
        db.prepare(`
            SELECT COUNT(*) AS total
            FROM campaign_sectors
            WHERE campaign_id = ?
        `).get(
            campaignId
        ).total;

    const validated =
        db.prepare(`
            SELECT COUNT(*) AS total
            FROM validations
            WHERE campaign_id = ?
        `).get(
            campaignId
        ).total;

    return {
        total,
        validated,
        percent: total === 0
            ? 0
            : Math.round((validated / total) * 100)
    };
}

/*
|--------------------------------------------------------------------------
| Archivage automatique si campagne terminée
|--------------------------------------------------------------------------
|
| Si tous les secteurs sont validés :
| - archive la campagne
| - renseigne archived_at
| - renseigne completed_by
| - écrit un log
|
|--------------------------------------------------------------------------
*/

function archiveCampaignIfComplete(campaignId, userId) {
    const progress =
        getCampaignProgress(campaignId);

    let archived = false;

    if (
        progress.total > 0 &&
        progress.validated >= progress.total
    ) {
        const result =
            db.prepare(`
                UPDATE campaigns
                SET
                    archived = 1,
                    archived_at = CURRENT_TIMESTAMP,
                    completed_by = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND archived = 0
            `).run(
                userId,
                campaignId
            );

        if (result.changes > 0) {
            db.prepare(`
                INSERT INTO logs (
                    user_id,
                    action,
                    entity_type,
                    entity_id,
                    details,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                userId,
                "AUTO_ARCHIVE_CAMPAIGN",
                "campaign",
                campaignId,
                JSON.stringify({
                    reason: "progress_100_percent"
                })
            );

            archived = true;
        }
    }

    return {
        total: progress.total,
        validated: progress.validated,
        percent: progress.percent,
        archived
    };
}

/*
|--------------------------------------------------------------------------
| Écriture d'un log
|--------------------------------------------------------------------------
*/

function insertCampaignLog(
    userId,
    action,
    campaignId,
    details = {}
) {
    db.prepare(`
        INSERT INTO logs (
            user_id,
            action,
            entity_type,
            entity_id,
            details,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
        userId,
        action,
        "campaign",
        campaignId,
        JSON.stringify(details)
    );
}

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = {
    canAccessCampaign,
    canManageCampaign,
    canCreateCampaignForTeam,
    getCampaignById,
    cleanSectorIds,
    validateExistingSectors,
    getCampaignProgress,
    archiveCampaignIfComplete,
    insertCampaignLog
};