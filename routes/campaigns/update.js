/*
|--------------------------------------------------------------------------
| Map Boitage - Modification de campagne
|--------------------------------------------------------------------------
|
| Fichier : routes/campaigns/update.js
|
| Rôle :
| PUT /api/campaigns/:id
|
| Permet :
| - changer le nom d'une campagne active
| - ajouter des secteurs
| - retirer des secteurs non validés
|
| Droits :
| - admin   : peut modifier toutes les campagnes
| - manager : peut modifier uniquement les campagnes de ses équipes
|
| Sécurités :
| - impossible de modifier une campagne archivée
| - impossible de retirer un secteur déjà validé
| - impossible d'ajouter un secteur d'une autre équipe
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
    cleanSectorIds,
    validateExistingSectors,
    insertCampaignLog
} = require("./helpers");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| PUT /api/campaigns/:id
|--------------------------------------------------------------------------
*/

router.put(
    "/:id",
    requireManagerOrAdmin,
    (req, res) => {
        try {
            const campaignId =
                Number(req.params.id);

            const {
                name,
                sectorIds = []
            } = req.body;

            const cleanName =
                String(name || "").trim();

            const newSectorIds =
                cleanSectorIds(sectorIds);

            /*
            |--------------------------------------------------------------------------
            | Validation ID campagne
            |--------------------------------------------------------------------------
            */

            if (!campaignId) {
                return res.status(400).json({
                    success: false,
                    message: "Campagne invalide."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Validation nom
            |--------------------------------------------------------------------------
            */

            if (!cleanName) {
                return res.status(400).json({
                    success: false,
                    message: "Nom de campagne requis."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Validation secteurs sélectionnés
            |--------------------------------------------------------------------------
            */

            if (newSectorIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Sélectionnez au moins un secteur."
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
                    message: "Vous ne pouvez pas modifier cette campagne."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Interdiction campagne archivée
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
            | Vérification existence secteurs
            |--------------------------------------------------------------------------
            */

            if (
                !validateExistingSectors(
                    newSectorIds
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Un ou plusieurs secteurs sont invalides."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Vérification équipe des secteurs
            |--------------------------------------------------------------------------
            |
            | Tous les secteurs sélectionnés doivent appartenir à la même équipe
            | que la campagne.
            |
            |--------------------------------------------------------------------------
            */

            const placeholdersForNewSectors =
                newSectorIds.map(() => "?").join(",");

            const selectedSectors =
                db.prepare(`
                    SELECT
                        id,
                        team_id,
                        name
                    FROM sectors
                    WHERE id IN (${placeholdersForNewSectors})
                `).all(
                    ...newSectorIds
                );

            const invalidTeamSector =
                selectedSectors.find(sector => {
                    return Number(sector.team_id) !== Number(campaign.team_id);
                });

            if (invalidTeamSector) {
                return res.status(400).json({
                    success: false,
                    message: "Tous les secteurs doivent appartenir à l'équipe de la campagne."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Secteurs actuels de la campagne
            |--------------------------------------------------------------------------
            */

            const currentSectorIds =
                db.prepare(`
                    SELECT sector_id
                    FROM campaign_sectors
                    WHERE campaign_id = ?
                `).all(
                    campaignId
                ).map(row => Number(row.sector_id));

            /*
            |--------------------------------------------------------------------------
            | Calcul des ajouts / retraits
            |--------------------------------------------------------------------------
            */

            const sectorsToAdd =
                newSectorIds.filter(sectorId => {
                    return !currentSectorIds.includes(sectorId);
                });

            const sectorsToRemove =
                currentSectorIds.filter(sectorId => {
                    return !newSectorIds.includes(sectorId);
                });

            /*
            |--------------------------------------------------------------------------
            | Interdiction de retirer un secteur déjà validé
            |--------------------------------------------------------------------------
            */

            if (sectorsToRemove.length > 0) {
                const placeholdersToRemove =
                    sectorsToRemove.map(() => "?").join(",");

                const validatedRemovedSectors =
                    db.prepare(`
                        SELECT
                            v.sector_id,
                            s.name AS sector_name
                        FROM validations v

                        INNER JOIN sectors s
                            ON s.id = v.sector_id

                        WHERE v.campaign_id = ?
                        AND v.sector_id IN (${placeholdersToRemove})
                    `).all(
                        campaignId,
                        ...sectorsToRemove
                    );

                if (validatedRemovedSectors.length > 0) {
                    const names =
                        validatedRemovedSectors
                            .map(sector => sector.sector_name)
                            .join(", ");

                    return res.status(400).json({
                        success: false,
                        message: `Impossible de retirer un secteur déjà validé : ${names}.`
                    });
                }
            }

            /*
            |--------------------------------------------------------------------------
            | Transaction modification
            |--------------------------------------------------------------------------
            */

            const transaction =
                db.transaction(() => {
                    /*
                    |--------------------------------------------------------------------------
                    | Mise à jour nom campagne
                    |--------------------------------------------------------------------------
                    */

                    db.prepare(`
                        UPDATE campaigns
                        SET
                            name = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(
                        cleanName,
                        campaignId
                    );

                    /*
                    |--------------------------------------------------------------------------
                    | Ajout des nouveaux secteurs
                    |--------------------------------------------------------------------------
                    */

                    const insertCampaignSector =
                        db.prepare(`
                            INSERT OR IGNORE INTO campaign_sectors (
                                campaign_id,
                                sector_id,
                                created_at
                            )
                            VALUES (
                                ?,
                                ?,
                                CURRENT_TIMESTAMP
                            )
                        `);

                    sectorsToAdd.forEach(sectorId => {
                        insertCampaignSector.run(
                            campaignId,
                            sectorId
                        );
                    });

                    /*
                    |--------------------------------------------------------------------------
                    | Retrait des secteurs supprimés
                    |--------------------------------------------------------------------------
                    |
                    | On supprime aussi les validations de rues éventuelles.
                    | La validation secteur complète est déjà interdite plus haut.
                    |
                    |--------------------------------------------------------------------------
                    */

                    const deleteStreetValidations =
                        db.prepare(`
                            DELETE FROM street_validations
                            WHERE campaign_id = ?
                            AND sector_id = ?
                        `);

                    const deleteCampaignSector =
                        db.prepare(`
                            DELETE FROM campaign_sectors
                            WHERE campaign_id = ?
                            AND sector_id = ?
                        `);

                    sectorsToRemove.forEach(sectorId => {
                        deleteStreetValidations.run(
                            campaignId,
                            sectorId
                        );

                        deleteCampaignSector.run(
                            campaignId,
                            sectorId
                        );
                    });

                    /*
                    |--------------------------------------------------------------------------
                    | Log
                    |--------------------------------------------------------------------------
                    */

                    insertCampaignLog(
                        req.session.user.id,
                        "UPDATE_CAMPAIGN",
                        campaignId,
                        {
                            oldName: campaign.name,
                            newName: cleanName,
                            teamId: campaign.team_id,
                            oldSectorIds: currentSectorIds,
                            newSectorIds,
                            addedSectorIds: sectorsToAdd,
                            removedSectorIds: sectorsToRemove
                        }
                    );
                });

            transaction();

            /*
            |--------------------------------------------------------------------------
            | Réponse
            |--------------------------------------------------------------------------
            */

            return res.json({
                success: true,
                message: "Campagne modifiée.",
                campaignId
            });

        } catch (error) {
            console.error(
                "Erreur PUT /api/campaigns/:id :",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Erreur lors de la modification de la campagne."
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