/*
|--------------------------------------------------------------------------
| Map Boitage - Campagnes / Gestion des secteurs liés
|--------------------------------------------------------------------------
|
| Fichier : routes/campaigns/sectors.js
|
| Rôle :
| - POST /api/campaigns/:campaignId/sectors/:sectorId
| - DELETE /api/campaigns/:campaignId/sectors/:sectorId
|
| Permet :
| - d'ajouter un secteur à une campagne active
| - de retirer un secteur non validé d'une campagne active
|
| Droits :
| - admin   : toutes les campagnes
| - manager : campagnes de ses équipes uniquement
|
|--------------------------------------------------------------------------
*/

const express = require("express");

const db = require("../../db/db");

const {
    requireManagerOrAdmin
} = require("../../middleware/auth");

const {
    canManageCampaign,
    getCampaignById,
    insertCampaignLog
} = require("./helpers");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| POST /api/campaigns/:campaignId/sectors/:sectorId
|--------------------------------------------------------------------------
|
| Ajoute un secteur à une campagne active.
|
|--------------------------------------------------------------------------
*/

router.post(
    "/:campaignId/sectors/:sectorId",
    requireManagerOrAdmin,
    (req, res) => {
        try {
            const campaignId =
                Number(req.params.campaignId);

            const sectorId =
                Number(req.params.sectorId);

            /*
            |--------------------------------------------------------------------------
            | Validation IDs
            |--------------------------------------------------------------------------
            */

            if (!campaignId || !sectorId) {
                return res.status(400).json({
                    success: false,
                    message: "Campagne ou secteur invalide."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Chargement campagne
            |--------------------------------------------------------------------------
            */

            const campaign =
                getCampaignById(campaignId);

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: "Campagne introuvable."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Vérification droits
            |--------------------------------------------------------------------------
            */

            if (
                !canManageCampaign(
                    req,
                    campaign
                )
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Vous ne pouvez pas gérer cette campagne."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Campagne archivée
            |--------------------------------------------------------------------------
            */

            if (campaign.archived) {
                return res.status(400).json({
                    success: false,
                    message: "Impossible de modifier une campagne archivée."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Vérification secteur
            |--------------------------------------------------------------------------
            */

            const sector =
                db.prepare(`
                    SELECT
                        id,
                        team_id,
                        name
                    FROM sectors
                    WHERE id = ?
                `).get(
                    sectorId
                );

            if (!sector) {
                return res.status(404).json({
                    success: false,
                    message: "Secteur introuvable."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Sécurité équipe
            |--------------------------------------------------------------------------
            |
            | Un secteur ajouté à une campagne doit appartenir à la même équipe
            | que la campagne.
            |
            |--------------------------------------------------------------------------
            */

            if (
                Number(sector.team_id) !== Number(campaign.team_id)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Ce secteur n'appartient pas à l'équipe de la campagne."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Vérification doublon
            |--------------------------------------------------------------------------
            */

            const existing =
                db.prepare(`
                    SELECT id
                    FROM campaign_sectors
                    WHERE campaign_id = ?
                    AND sector_id = ?
                `).get(
                    campaignId,
                    sectorId
                );

            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: "Ce secteur est déjà dans cette campagne."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Ajout secteur
            |--------------------------------------------------------------------------
            */

            db.prepare(`
                INSERT INTO campaign_sectors (
                    campaign_id,
                    sector_id,
                    created_at
                )
                VALUES (
                    ?,
                    ?,
                    CURRENT_TIMESTAMP
                )
            `).run(
                campaignId,
                sectorId
            );

            /*
            |--------------------------------------------------------------------------
            | Log
            |--------------------------------------------------------------------------
            */

            insertCampaignLog(
                req.session.user.id,
                "ADD_SECTOR_TO_CAMPAIGN",
                campaignId,
                {
                    sectorId,
                    sectorName: sector.name
                }
            );

            return res.json({
                success: true,
                message: "Secteur ajouté à la campagne."
            });

        } catch (error) {
            console.error(
                "Erreur ajout secteur campagne :",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Erreur lors de l'ajout du secteur."
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| DELETE /api/campaigns/:campaignId/sectors/:sectorId
|--------------------------------------------------------------------------
|
| Retire un secteur d'une campagne active.
|
| Important :
| - interdit si le secteur est déjà validé
| - supprime aussi les validations de rues de ce secteur pour cette campagne
|
|--------------------------------------------------------------------------
*/

router.delete(
    "/:campaignId/sectors/:sectorId",
    requireManagerOrAdmin,
    (req, res) => {
        try {
            const campaignId =
                Number(req.params.campaignId);

            const sectorId =
                Number(req.params.sectorId);

            /*
            |--------------------------------------------------------------------------
            | Validation IDs
            |--------------------------------------------------------------------------
            */

            if (!campaignId || !sectorId) {
                return res.status(400).json({
                    success: false,
                    message: "Campagne ou secteur invalide."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Chargement campagne
            |--------------------------------------------------------------------------
            */

            const campaign =
                getCampaignById(campaignId);

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: "Campagne introuvable."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Vérification droits
            |--------------------------------------------------------------------------
            */

            if (
                !canManageCampaign(
                    req,
                    campaign
                )
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Vous ne pouvez pas gérer cette campagne."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Campagne archivée
            |--------------------------------------------------------------------------
            */

            if (campaign.archived) {
                return res.status(400).json({
                    success: false,
                    message: "Impossible de modifier une campagne archivée."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Vérification validation secteur
            |--------------------------------------------------------------------------
            */

            const validation =
                db.prepare(`
                    SELECT id
                    FROM validations
                    WHERE campaign_id = ?
                    AND sector_id = ?
                `).get(
                    campaignId,
                    sectorId
                );

            if (validation) {
                return res.status(400).json({
                    success: false,
                    message: "Impossible de retirer un secteur déjà validé."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Chargement secteur pour log
            |--------------------------------------------------------------------------
            */

            const sector =
                db.prepare(`
                    SELECT
                        id,
                        name
                    FROM sectors
                    WHERE id = ?
                `).get(
                    sectorId
                );

            /*
            |--------------------------------------------------------------------------
            | Transaction retrait
            |--------------------------------------------------------------------------
            */

            const transaction =
                db.transaction(() => {
                    /*
                    |--------------------------------------------------------------------------
                    | Suppression validations rues
                    |--------------------------------------------------------------------------
                    |
                    | Normalement, si le secteur n'est pas validé, il peut quand même
                    | avoir quelques rues validées individuellement.
                    | On les supprime pour ne pas garder de données orphelines.
                    |
                    |--------------------------------------------------------------------------
                    */

                    db.prepare(`
                        DELETE FROM street_validations
                        WHERE campaign_id = ?
                        AND sector_id = ?
                    `).run(
                        campaignId,
                        sectorId
                    );

                    /*
                    |--------------------------------------------------------------------------
                    | Suppression liaison campagne / secteur
                    |--------------------------------------------------------------------------
                    */

                    const result =
                        db.prepare(`
                            DELETE FROM campaign_sectors
                            WHERE campaign_id = ?
                            AND sector_id = ?
                        `).run(
                            campaignId,
                            sectorId
                        );

                    if (result.changes === 0) {
                        throw new Error(
                            "SECTOR_NOT_IN_CAMPAIGN"
                        );
                    }

                    /*
                    |--------------------------------------------------------------------------
                    | Log
                    |--------------------------------------------------------------------------
                    */

                    insertCampaignLog(
                        req.session.user.id,
                        "REMOVE_SECTOR_FROM_CAMPAIGN",
                        campaignId,
                        {
                            sectorId,
                            sectorName: sector ? sector.name : null
                        }
                    );
                });

            try {
                transaction();
            } catch (error) {
                if (
                    error.message === "SECTOR_NOT_IN_CAMPAIGN"
                ) {
                    return res.status(404).json({
                        success: false,
                        message: "Secteur non présent dans cette campagne."
                    });
                }

                throw error;
            }

            return res.json({
                success: true,
                message: "Secteur retiré de la campagne."
            });

        } catch (error) {
            console.error(
                "Erreur retrait secteur campagne :",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Erreur lors du retrait du secteur."
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = router;