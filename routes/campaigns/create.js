/*
|--------------------------------------------------------------------------
| Map Boitage - Création de campagne
|--------------------------------------------------------------------------
|
| Fichier : routes/campaigns/create.js
|
| Rôle :
| POST /api/campaigns
|
| Permet :
| - Admin :
|     créer une campagne pour n'importe quelle équipe
|
| - Manager :
|     créer une campagne uniquement pour ses équipes
|
| Règle importante :
| - Une campagne appartient à une équipe
| - Les secteurs sont globaux
| - Les secteurs ne sont PAS liés à une équipe
|
|--------------------------------------------------------------------------
*/

const express = require("express");

const db = require("../../db/db");

const {
    requireManagerOrAdmin
} = require("../../middleware/auth");

const {
    canCreateCampaignForTeam,
    cleanSectorIds,
    validateExistingSectors,
    insertCampaignLog
} = require("./helpers");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| POST /api/campaigns
|--------------------------------------------------------------------------
*/

router.post(
    "/",
    requireManagerOrAdmin,
    (req, res) => {

        try {

            const {
                name,
                teamId,
                sectorIds = []
            } = req.body;

            const cleanName =
                String(name || "").trim();

            const cleanTeamId =
                Number(teamId);

            const cleanedSectorIds =
                cleanSectorIds(sectorIds);

            /*
            |--------------------------------------------------------------------------
            | Validation du nom
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
            | Validation équipe
            |--------------------------------------------------------------------------
            */

            if (!cleanTeamId) {
                return res.status(400).json({
                    success: false,
                    message: "Équipe requise."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Vérification des droits
            |--------------------------------------------------------------------------
            |
            | Admin :
            | - peut créer pour toutes les équipes.
            |
            | Manager :
            | - peut créer uniquement pour les équipes dont il est responsable.
            |
            */

            if (
                !canCreateCampaignForTeam(
                    req,
                    cleanTeamId
                )
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Vous ne pouvez pas créer de campagne pour cette équipe."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Vérification existence équipe
            |--------------------------------------------------------------------------
            */

            const team =
                db.prepare(`
                    SELECT
                        id,
                        name
                    FROM teams
                    WHERE id = ?
                `).get(
                    cleanTeamId
                );

            if (!team) {
                return res.status(404).json({
                    success: false,
                    message: "Équipe introuvable."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Validation secteurs
            |--------------------------------------------------------------------------
            |
            | Les secteurs sont globaux.
            |
            | On vérifie uniquement :
            | - qu'au moins un secteur est sélectionné
            | - que les secteurs existent bien en base
            |
            | On ne vérifie PAS team_id ici.
            |
            */

            if (
                cleanedSectorIds.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Sélectionnez au moins un secteur."
                });
            }

            if (
                !validateExistingSectors(
                    cleanedSectorIds
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Un ou plusieurs secteurs sont invalides."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Transaction création
            |--------------------------------------------------------------------------
            */

            const transaction =
                db.transaction(() => {

                    /*
                    |--------------------------------------------------------------------------
                    | Création de la campagne
                    |--------------------------------------------------------------------------
                    */

                    const result =
                        db.prepare(`
                            INSERT INTO campaigns (
                                name,
                                team_id,
                                created_by,
                                created_at
                            )
                            VALUES (
                                ?,
                                ?,
                                ?,
                                CURRENT_TIMESTAMP
                            )
                        `).run(
                            cleanName,
                            cleanTeamId,
                            req.session.user.id
                        );

                    const campaignId =
                        result.lastInsertRowid;

                    /*
                    |--------------------------------------------------------------------------
                    | Liaison campagne ↔ secteurs
                    |--------------------------------------------------------------------------
                    |
                    | Ici on lie simplement les secteurs sélectionnés
                    | à la campagne créée.
                    |
                    | Les secteurs ne dépendent pas de l'équipe.
                    |
                    */

                    const insertSector =
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
                        `);

                    cleanedSectorIds.forEach(
                        sectorId => {

                            insertSector.run(
                                campaignId,
                                sectorId
                            );

                        }
                    );

                    /*
                    |--------------------------------------------------------------------------
                    | Journalisation
                    |--------------------------------------------------------------------------
                    */

                    insertCampaignLog(
                        req.session.user.id,
                        "CREATE_CAMPAIGN",
                        campaignId,
                        {
                            name: cleanName,
                            teamId: cleanTeamId,
                            teamName: team.name,
                            sectorIds: cleanedSectorIds
                        }
                    );

                    return campaignId;
                });

            const campaignId =
                transaction();

            /*
            |--------------------------------------------------------------------------
            | Réponse
            |--------------------------------------------------------------------------
            */

            return res.status(201).json({
                success: true,
                message: "Campagne créée.",
                campaignId
            });

        } catch (error) {

            console.error(
                "Erreur POST /api/campaigns :",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Erreur lors de la création de la campagne."
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