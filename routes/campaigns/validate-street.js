/*
|--------------------------------------------------------------------------
| Map Boitage - Validation rue de campagne
|--------------------------------------------------------------------------
|
| Fichier : routes/campaigns/validate-street.js
|
| Rôle :
| POST /api/campaigns/:campaignId/validate-street/:streetId
|
| Permet :
| - valider une rue individuellement
| - valider automatiquement le secteur si toutes ses rues sont validées
| - archiver automatiquement la campagne si elle atteint 100%
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
| POST /api/campaigns/:campaignId/validate-street/:streetId
|--------------------------------------------------------------------------
*/

router.post(
    "/:campaignId/validate-street/:streetId",
    requireAuth,
    (req, res) => {
        try {
            const campaignId =
                Number(req.params.campaignId);

            const streetId =
                Number(req.params.streetId);

            const comment =
                String(req.body.comment || "").trim();

            if (!campaignId || !streetId) {
                return res.status(400).json({
                    success: false,
                    message: "Campagne ou rue invalide."
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

            const street =
                db.prepare(`
                    SELECT
                        id,
                        name,
                        sector_id
                    FROM streets
                    WHERE id = ?
                `).get(streetId);

            if (!street) {
                return res.status(404).json({
                    success: false,
                    message: "Rue introuvable."
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
                    street.sector_id
                );

            if (!linkedSector) {
                return res.status(400).json({
                    success: false,
                    message: "Cette rue n'appartient pas à un secteur de cette campagne."
                });
            }

            const existingStreetValidation =
                db.prepare(`
                    SELECT id
                    FROM street_validations
                    WHERE campaign_id = ?
                    AND street_id = ?
                `).get(
                    campaignId,
                    streetId
                );

            if (existingStreetValidation) {
                return res.status(409).json({
                    success: false,
                    message: "Cette rue est déjà validée."
                });
            }

            const transaction =
                db.transaction(() => {
                    db.prepare(`
                        INSERT INTO street_validations (
                            campaign_id,
                            sector_id,
                            street_id,
                            validated_by,
                            comment,
                            validated_at
                        )
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `).run(
                        campaignId,
                        street.sector_id,
                        streetId,
                        req.session.user.id,
                        comment
                    );

                    insertCampaignLog(
                        req.session.user.id,
                        "VALIDATE_STREET",
                        campaignId,
                        {
                            sectorId: street.sector_id,
                            streetId,
                            streetName: street.name,
                            comment
                        }
                    );

                    const totalStreets =
                        db.prepare(`
                            SELECT COUNT(*) AS total
                            FROM streets
                            WHERE sector_id = ?
                        `).get(
                            street.sector_id
                        ).total;

                    const validatedStreets =
                        db.prepare(`
                            SELECT COUNT(*) AS total
                            FROM street_validations
                            WHERE campaign_id = ?
                            AND sector_id = ?
                        `).get(
                            campaignId,
                            street.sector_id
                        ).total;

                    let sectorAutoValidated =
                        false;

                    if (
                        totalStreets > 0 &&
                        validatedStreets >= totalStreets
                    ) {
                        const existingSectorValidation =
                            db.prepare(`
                                SELECT id
                                FROM validations
                                WHERE campaign_id = ?
                                AND sector_id = ?
                            `).get(
                                campaignId,
                                street.sector_id
                            );

                        if (!existingSectorValidation) {
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
                                street.sector_id,
                                req.session.user.id,
                                "Secteur validé automatiquement : toutes les rues sont terminées."
                            );

                            insertCampaignLog(
                                req.session.user.id,
                                "AUTO_VALIDATE_SECTOR",
                                campaignId,
                                {
                                    sectorId: street.sector_id,
                                    reason: "all_streets_validated"
                                }
                            );

                            sectorAutoValidated =
                                true;
                        }
                    }

                    const campaignProgress =
                        archiveCampaignIfComplete(
                            campaignId,
                            req.session.user.id
                        );

                    return {
                        totalStreets,
                        validatedStreets,
                        sectorAutoValidated,
                        campaignProgress
                    };
                });

            const result =
                transaction();

            return res.json({
                success: true,
                message: result.campaignProgress.archived
                    ? "Rue validée. Secteur terminé et campagne archivée automatiquement."
                    : result.sectorAutoValidated
                        ? "Rue validée. Toutes les rues sont terminées, le secteur est validé automatiquement."
                        : "Rue validée.",
                street_progress: {
                    total_streets: result.totalStreets,
                    validated_streets: result.validatedStreets,
                    percent: result.totalStreets === 0
                        ? 0
                        : Math.round(
                            (result.validatedStreets / result.totalStreets) * 100
                        )
                },
                campaign_progress: {
                    total_sectors: result.campaignProgress.total,
                    validated_sectors: result.campaignProgress.validated,
                    percent: result.campaignProgress.percent,
                    archived: result.campaignProgress.archived
                }
            });

        } catch (error) {
            console.error(
                "Erreur POST validate-street :",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Erreur lors de la validation de la rue."
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