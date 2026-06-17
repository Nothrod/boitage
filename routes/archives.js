/*
|--------------------------------------------------------------------------
| Map Boitage - Routes Archives
|--------------------------------------------------------------------------
|
| Fichier : routes/archives.js
|
| Rôle :
| Consultation des campagnes archivées.
|
| Une campagne est archivée automatiquement lorsque :
| - tous les secteurs sont validés
|
| Accès :
| Administrateur uniquement.
|
| Routes :
|
| GET /api/archives
| GET /api/archives/:id
|
|--------------------------------------------------------------------------
*/

const express = require("express");

const db = require("../db/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Protection globale
|--------------------------------------------------------------------------
*/

router.use(requireAdmin);

/*
|--------------------------------------------------------------------------
| GET /api/archives
|--------------------------------------------------------------------------
|
| Liste toutes les campagnes archivées.
|
|--------------------------------------------------------------------------
*/

router.get("/", (req, res) => {
    try {
        const campaigns = db
            .prepare(`
                SELECT
                    c.id,
                    c.name,
                    c.created_at,
                    c.archived_at,

                    creator.name AS created_by_name,
                    completed.name AS completed_by_name

                FROM campaigns c

                LEFT JOIN users creator
                    ON creator.id = c.created_by

                LEFT JOIN users completed
                    ON completed.id = c.completed_by

                WHERE c.archived = 1

                ORDER BY c.archived_at DESC
            `)
            .all();

        const result = campaigns.map(campaign => {

            const totalSectors = db
                .prepare(`
                    SELECT COUNT(*) AS total
                    FROM campaign_sectors
                    WHERE campaign_id = ?
                `)
                .get(campaign.id).total;

            const validatedSectors = db
                .prepare(`
                    SELECT COUNT(*) AS total
                    FROM validations
                    WHERE campaign_id = ?
                `)
                .get(campaign.id).total;

            return {
                ...campaign,
                total_sectors: totalSectors,
                validated_sectors: validatedSectors,
                progress: 100
            };
        });

        res.json({
            success: true,
            archives: result
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Erreur lors du chargement des archives."
        });
    }
});

/*
|--------------------------------------------------------------------------
| GET /api/archives/:id
|--------------------------------------------------------------------------
|
| Détail complet d'une campagne archivée.
|
|--------------------------------------------------------------------------
*/

router.get("/:id", (req, res) => {
    try {

        const archiveId = Number(req.params.id);

        const campaign = db
            .prepare(`
                SELECT
                    c.id,
                    c.name,
                    c.created_at,
                    c.archived_at,

                    creator.name AS created_by_name,
                    completed.name AS completed_by_name

                FROM campaigns c

                LEFT JOIN users creator
                    ON creator.id = c.created_by

                LEFT JOIN users completed
                    ON completed.id = c.completed_by

                WHERE c.id = ?
                AND c.archived = 1
            `)
            .get(archiveId);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Archive introuvable."
            });
        }

        const sectors = db
            .prepare(`
                SELECT
                    s.id,
                    s.name,
                    s.color,

                    v.comment,
                    v.validated_at,

                    u.name AS validated_by_name

                FROM campaign_sectors cs

                INNER JOIN sectors s
                    ON s.id = cs.sector_id

                LEFT JOIN validations v
                    ON v.campaign_id = cs.campaign_id
                    AND v.sector_id = cs.sector_id

                LEFT JOIN users u
                    ON u.id = v.validated_by

                WHERE cs.campaign_id = ?

                ORDER BY s.name
            `)
            .all(archiveId);

        const totalSectors = sectors.length;

        const validatedSectors = sectors.filter(
            sector => sector.validated_at
        ).length;

        res.json({
            success: true,

            archive: {
                ...campaign,

                total_sectors: totalSectors,
                validated_sectors: validatedSectors,
                progress: 100,

                sectors
            }
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Erreur lors du chargement de l'archive."
        });
    }
});

/*
|--------------------------------------------------------------------------
| DELETE /api/archives/:id
|--------------------------------------------------------------------------
|
| Supprime définitivement une campagne archivée.
| (Réservé aux administrateurs via le middleware global requireAdmin)
|
|--------------------------------------------------------------------------
*/
router.delete("/:id", (req, res) => {
    try {
        const archiveId = Number(req.params.id);

        if (!archiveId) {
            return res.status(400).json({
                success: false,
                message: "ID d'archive invalide."
            });
        }

        // Sécurité : Vérifier que la campagne existe ET qu'elle est bien archivée
        const campaign = db.prepare(`
            SELECT id, name, archived 
            FROM campaigns 
            WHERE id = ? AND archived = 1
        `).get(archiveId);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Archive introuvable ou non archivée."
            });
        }

        // Suppression de la campagne
        // Les enregistrements liés (campaign_sectors, validations, street_validations)
        // sont supprimés automatiquement grâce aux clés étrangères ON DELETE CASCADE.
        db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(archiveId);

        return res.json({
            success: true,
            message: "L'archive a été supprimée avec succès."
        });

    } catch (error) {
        console.error("Erreur DELETE /api/archives/:id :", error);
        return res.status(500).json({
            success: false,
            message: "Erreur lors de la suppression de l'archive."
        });
    }
});

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = router;