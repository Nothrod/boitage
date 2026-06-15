/*
|--------------------------------------------------------------------------
| Map Boitage - Validation secteur de campagne
|--------------------------------------------------------------------------
|
| Fichier : routes/campaigns/validate-sector.js
|
| Rôle :
| POST /api/campaigns/:campaignId/validate/:sectorId
|
| Permet :
| - valider un secteur entier
| - valider automatiquement toutes les rues du secteur
| - archiver automatiquement la campagne si elle atteint 100%
|
| Droits :
| - admin   : peut valider les campagnes accessibles
| - manager : peut valider les campagnes de ses équipes
| - user    : peut valider les campagnes de ses équipes
|
|--------------------------------------------------------------------------
*/

const express = require("express");

const db = require("../../db/db");

const {
    requireAuth
} = require("../../middleware/auth");

const {
    canAccessCampaign,
    getCampaignById,
    archiveCampaignIfComplete,
    insertCampaignLog
} = require("./helpers");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| POST /api/campaigns/:campaignId/validate/:sectorId
|--------------------------------------------------------------------------
*/

router.post(
    "/:campaignId/validate/:sectorId",
    requireAuth,
    (req, res) => {
        try {
            const campaignId =
                Number(req.params.campaignId);

            const sectorId =
                Number(req.params.sectorId);

            const comment =
                String(req.body.comment || "").trim();

            if (!campaignId || !sectorId) {
                return res.status(400).json({
                    success: false,
                    message: "Campagne ou secteur invalide."
                });
            }

            const campaign =
                getCampaignById(campaignId);

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: "Campagne introuvable."
                });
            }

            if (!canAccessCampaign(req, campaign)) {
                return res.status(403).json({
                    success: false,
                    message: "Vous n'avez pas accès à cette campagne."
                });
            }

            if (campaign.archived) {
                return res.status(400).json({
                    success: false,
                    message: "Cette campagne est déjà archivée."
                });
            }

            const linkedSector =
                db.prepare(`
                    SELECT id
                    FROM campaign_sectors
                    WHERE campaign_id = ?
                    AND sector_id = ?
                `).get(
                    campaignId,
                    sectorId
                );

            if (!linkedSector) {
                return res.status(400).json({
                    success: false,
                    message: "Ce secteur n'appartient pas à cette campagne."
                });
            }

            const existingValidation =
                db.prepare(`
                    SELECT id
                    FROM validations
                    WHERE campaign_id = ?
                    AND sector_id = ?
                `).get(
                    campaignId,
                    sectorId
                );

            if (existingValidation) {
                return res.status(409).json({
                    success: false,
                    message: "Ce secteur est déjà validé."
                });
            }

            const transaction =
                db.transaction(() => {
                    db.prepare(`
                        INSERT INTO validations (
                            campaign_id,
                            sector_id,
                            validated_by,
                            comment,
                            validated_at
                        )
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `).run(
                        campaignId,
                        sectorId,
                        req.session.user.id,
                        comment
                    );

                    const streets =
                        db.prepare(`
                            SELECT id
                            FROM streets
                            WHERE sector_id = ?
                        `).all(
                            sectorId
                        );

                    const insertStreetValidation =
                        db.prepare(`
                            INSERT OR IGNORE INTO street_validations (
                                campaign_id,
                                sector_id,
                                street_id,
                                validated_by,
                                comment,
                                validated_at
                            )
                            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        `);

                    streets.forEach(street => {
                        insertStreetValidation.run(
                            campaignId,
                            sectorId,
                            street.id,
                            req.session.user.id,
                            comment
                        );
                    });

                    insertCampaignLog(
                        req.session.user.id,
                        "VALIDATE_SECTOR",
                        campaignId,
                        {
                            sectorId,
                            comment,
                            mode: "sector_full"
                        }
                    );

                    return archiveCampaignIfComplete(
                        campaignId,
                        req.session.user.id
                    );
                });

            const result =
                transaction();

            return res.json({
                success: true,
                message: result.archived
                    ? "Secteur validé. Campagne archivée automatiquement."
                    : "Secteur validé.",
                progress: {
                    total_sectors: result.total,
                    validated_sectors: result.validated,
                    percent: result.percent,
                    archived: result.archived
                }
            });

        } catch (error) {
            console.error(
                "Erreur POST validate sector :",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Erreur lors de la validation du secteur."
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