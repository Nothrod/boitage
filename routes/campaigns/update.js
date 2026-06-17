/*
|--------------------------------------------------------------------------
| Map Boitage - Modification de campagne
|--------------------------------------------------------------------------
*/

const express = require("express");
const db = require("../../db/db");
const { requireManagerOrAdmin } = require("../../middleware/auth");
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
router.put("/:id", requireManagerOrAdmin, (req, res) => {
    try {
        const campaignId = Number(req.params.id);
        const { name, sectorIds = [] } = req.body;
        const cleanName = String(name || "").trim();
        const newSectorIds = cleanSectorIds(sectorIds);

        if (!campaignId) {
            return res.status(400).json({ success: false, message: "Campagne invalide." });
        }

        if (!cleanName) {
            return res.status(400).json({ success: false, message: "Nom de campagne requis." });
        }

        if (newSectorIds.length === 0) {
            return res.status(400).json({ success: false, message: "Sélectionnez au moins un secteur." });
        }

        const campaign = getCampaignById(campaignId);
        if (!campaign) {
            return res.status(404).json({ success: false, message: "Campagne introuvable." });
        }

        if (!canManageCampaign(req, campaign)) {
            return res.status(403).json({ success: false, message: "Vous ne pouvez pas modifier cette campagne." });
        }

        if (campaign.archived) {
            return res.status(400).json({ success: false, message: "Impossible de modifier une campagne archivée." });
        }

        if (!validateExistingSectors(newSectorIds)) {
            return res.status(400).json({ success: false, message: "Un ou plusieurs secteurs sont invalides." });
        }

        // --- CORRECTION ICI : Suppression de la vérification team_id des secteurs ---
        // Les secteurs sont globaux et peuvent être utilisés par n'importe quelle équipe.

        /*
        |--------------------------------------------------------------------------
        | Secteurs actuels de la campagne
        |--------------------------------------------------------------------------
        */
        const currentSectorIds = db.prepare(`
            SELECT sector_id FROM campaign_sectors WHERE campaign_id = ?
        `).all(campaignId).map(row => Number(row.sector_id));

        /*
        |--------------------------------------------------------------------------
        | Calcul des ajouts / retraits
        |--------------------------------------------------------------------------
        */
        const sectorsToAdd = newSectorIds.filter(id => !currentSectorIds.includes(id));
        const sectorsToRemove = currentSectorIds.filter(id => !newSectorIds.includes(id));

        /*
        |--------------------------------------------------------------------------
        | Interdiction de retirer un secteur déjà validé
        |--------------------------------------------------------------------------
        */
        if (sectorsToRemove.length > 0) {
            const placeholdersToRemove = sectorsToRemove.map(() => "?").join(",");
            const validatedRemovedSectors = db.prepare(`
                SELECT v.sector_id, s.name AS sector_name
                FROM validations v
                INNER JOIN sectors s ON s.id = v.sector_id
                WHERE v.campaign_id = ? AND v.sector_id IN (${placeholdersToRemove})
            `).all(campaignId, ...sectorsToRemove);

            if (validatedRemovedSectors.length > 0) {
                const names = validatedRemovedSectors.map(s => s.sector_name).join(", ");
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
        const transaction = db.transaction(() => {
            // Mise à jour du nom
            db.prepare(`
                UPDATE campaigns SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).run(cleanName, campaignId);

            // Ajout des nouveaux secteurs
            const insertCampaignSector = db.prepare(`
                INSERT OR IGNORE INTO campaign_sectors (campaign_id, sector_id, created_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);
            sectorsToAdd.forEach(id => insertCampaignSector.run(campaignId, id));

            // Retrait des secteurs supprimés
            const deleteStreetValidations = db.prepare(`
                DELETE FROM street_validations WHERE campaign_id = ? AND sector_id = ?
            `);
            const deleteCampaignSector = db.prepare(`
                DELETE FROM campaign_sectors WHERE campaign_id = ? AND sector_id = ?
            `);
            
            sectorsToRemove.forEach(id => {
                deleteStreetValidations.run(campaignId, id);
                deleteCampaignSector.run(campaignId, id);
            });

            // Log
            insertCampaignLog(req.session.user.id, "UPDATE_CAMPAIGN", campaignId, {
                oldName: campaign.name,
                newName: cleanName,
                oldSectorIds: currentSectorIds,
                newSectorIds,
                addedSectorIds: sectorsToAdd,
                removedSectorIds: sectorsToRemove
            });
        });

        transaction();

        return res.json({ success: true, message: "Campagne modifiée.", campaignId });

    } catch (error) {
        console.error("Erreur PUT /api/campaigns/:id :", error);
        return res.status(500).json({ success: false, message: "Erreur lors de la modification de la campagne." });
    }
});

module.exports = router;