/*
|--------------------------------------------------------------------------
| Map Boitage - Suppression de campagne
|--------------------------------------------------------------------------
|
| Fichier : routes/campaigns/delete.js
|
| Rôle :
| DELETE /api/campaigns/:id
|
| Permet :
| - Admin :
|     supprimer n'importe quelle campagne active
|
| - Manager :
|     supprimer uniquement les campagnes de ses équipes
|
| Important :
| La suppression de la campagne supprime automatiquement :
| - campaign_sectors
| - validations
| - street_validations
|
| grâce aux clés étrangères ON DELETE CASCADE.
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
| DELETE /api/campaigns/:id
|--------------------------------------------------------------------------
*/

router.delete(
    "/:id",
    requireManagerOrAdmin,
    (req, res) => {
        try {
            const campaignId =
                Number(req.params.id);

            /*
            |--------------------------------------------------------------------------
            | Validation ID
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
                    message: "Vous ne pouvez pas supprimer cette campagne."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Transaction suppression
            |--------------------------------------------------------------------------
            */

            const transaction =
                db.transaction(() => {
                    /*
                    |--------------------------------------------------------------------------
                    | Log avant suppression
                    |--------------------------------------------------------------------------
                    |
                    | On log avant DELETE pour garder les infos de la campagne.
                    |
                    |--------------------------------------------------------------------------
                    */

                    insertCampaignLog(
                        req.session.user.id,
                        "DELETE_CAMPAIGN",
                        campaignId,
                        {
                            name: campaign.name,
                            teamId: campaign.team_id,
                            archived: campaign.archived
                        }
                    );

                    /*
                    |--------------------------------------------------------------------------
                    | Suppression campagne
                    |--------------------------------------------------------------------------
                    |
                    | Les lignes liées sont supprimées automatiquement via :
                    | - campaign_sectors.campaign_id ON DELETE CASCADE
                    | - validations.campaign_id ON DELETE CASCADE
                    | - street_validations.campaign_id ON DELETE CASCADE
                    |
                    |--------------------------------------------------------------------------
                    */

                    db.prepare(`
                        DELETE FROM campaigns
                        WHERE id = ?
                    `).run(
                        campaignId
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
                message: "Campagne supprimée."
            });

        } catch (error) {
            console.error(
                "Erreur DELETE /api/campaigns/:id :",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Erreur lors de la suppression de la campagne."
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