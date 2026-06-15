/*
|--------------------------------------------------------------------------
| Map Boitage - Routes Secteurs
|--------------------------------------------------------------------------
|
| Fichier : routes/sectors.js
|
| Rôle :
| Gérer les secteurs côté serveur :
| - lister tous les secteurs
| - créer un secteur
| - modifier un secteur
| - supprimer un secteur
|
| Droits :
| - admin : accès total
| - manager : lecture uniquement
| - user : accès refusé
|
|--------------------------------------------------------------------------
*/

const express = require("express");

const db = require("../db/db");

const {
    requireAuth,
    requireAdmin
} = require("../middleware/auth");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Nettoyage des rues
|--------------------------------------------------------------------------
*/

function cleanStreets(streets) {
    if (!Array.isArray(streets)) {
        return [];
    }

    return [...new Set(
        streets
            .map(street => String(street).trim())
            .filter(Boolean)
    )];
}

/*
|--------------------------------------------------------------------------
| Nettoyage couleur
|--------------------------------------------------------------------------
*/

function cleanColor(color) {
    const value = color
        ? String(color).trim()
        : "#3388ff";

    if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
        return "#3388ff";
    }

    return value;
}

/*
|--------------------------------------------------------------------------
| GET /api/sectors
|--------------------------------------------------------------------------
*/

router.get("/", requireAuth, (req, res) => {
    try {
        const role = req.session.user.role;

        if (role !== "admin" && role !== "manager") {
            return res.status(403).json({
                success: false,
                message: "Accès refusé."
            });
        }

        const sectors = db.prepare(`
            SELECT
                id,
                name,
                color,
                created_at,
                updated_at
            FROM sectors
            ORDER BY name ASC
        `).all();

        const streets = db.prepare(`
            SELECT
                id,
                sector_id,
                name,
                created_at
            FROM streets
            ORDER BY name ASC
        `).all();

        const result = sectors.map(sector => ({
            ...sector,
            streets: streets.filter(street =>
                Number(street.sector_id) === Number(sector.id)
            )
        }));

        return res.json({
            success: true,
            sectors: result
        });

    } catch (error) {
        console.error("Erreur GET /api/sectors :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors du chargement des secteurs."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/sectors
|--------------------------------------------------------------------------
*/

router.post("/", requireAdmin, (req, res) => {
    try {
        const name = req.body.name
            ? String(req.body.name).trim()
            : "";

        const color = cleanColor(req.body.color);
        const streets = cleanStreets(req.body.streets);

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nom du secteur requis."
            });
        }

        const existingSector = db.prepare(`
            SELECT id
            FROM sectors
            WHERE LOWER(name) = LOWER(?)
        `).get(name);

        if (existingSector) {
            return res.status(409).json({
                success: false,
                message: "Ce secteur existe déjà."
            });
        }

        const transaction = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO sectors (
                    name,
                    color,
                    created_at
                )
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `).run(name, color);

            const sectorId = result.lastInsertRowid;

            const insertStreet = db.prepare(`
                INSERT INTO streets (
                    sector_id,
                    name,
                    created_at
                )
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);

            streets.forEach(street => {
                insertStreet.run(sectorId, street);
            });

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
                req.session.user.id,
                "CREATE_SECTOR",
                "sector",
                sectorId,
                JSON.stringify({
                    name,
                    color,
                    streets
                })
            );

            return sectorId;
        });

        const sectorId = transaction();

        return res.status(201).json({
            success: true,
            message: "Secteur créé.",
            sectorId
        });

    } catch (error) {
        console.error("Erreur POST /api/sectors :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la création du secteur."
        });
    }
});

/*
|--------------------------------------------------------------------------
| PUT /api/sectors/:id
|--------------------------------------------------------------------------
|
| Modifie un secteur.
|
| Admin uniquement.
|
|--------------------------------------------------------------------------
*/

router.put("/:id", requireAdmin, (req, res) => {
    try {
        const sectorId = Number(req.params.id);

        const name = req.body.name
            ? String(req.body.name).trim()
            : "";

        const color = cleanColor(req.body.color);
        const streets = cleanStreets(req.body.streets);

        if (!sectorId) {
            return res.status(400).json({
                success: false,
                message: "Secteur invalide."
            });
        }

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nom du secteur requis."
            });
        }

        const sector = db.prepare(`
            SELECT
                id,
                name,
                color
            FROM sectors
            WHERE id = ?
        `).get(sectorId);

        if (!sector) {
            return res.status(404).json({
                success: false,
                message: "Secteur introuvable."
            });
        }

        const duplicate = db.prepare(`
            SELECT id
            FROM sectors
            WHERE LOWER(name) = LOWER(?)
            AND id != ?
        `).get(name, sectorId);

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: "Un autre secteur porte déjà ce nom."
            });
        }

        const oldStreets = db.prepare(`
            SELECT name
            FROM streets
            WHERE sector_id = ?
            ORDER BY name ASC
        `).all(sectorId).map(row => row.name);

        const transaction = db.transaction(() => {
            /*
            |--------------------------------------------------------------------------
            | Sécurité avant remplacement des rues
            |--------------------------------------------------------------------------
            |
            | Les validations de rues pointent vers street_id.
            | Donc avant de supprimer les anciennes rues, on supprime leurs validations.
            |
            |--------------------------------------------------------------------------
            */

            db.prepare(`
                DELETE FROM street_validations
                WHERE sector_id = ?
            `).run(sectorId);

            db.prepare(`
                UPDATE sectors
                SET
                    name = ?,
                    color = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(name, color, sectorId);

            db.prepare(`
                DELETE FROM streets
                WHERE sector_id = ?
            `).run(sectorId);

            const insertStreet = db.prepare(`
                INSERT INTO streets (
                    sector_id,
                    name,
                    created_at
                )
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);

            streets.forEach(street => {
                insertStreet.run(sectorId, street);
            });

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
                req.session.user.id,
                "UPDATE_SECTOR",
                "sector",
                sectorId,
                JSON.stringify({
                    oldName: sector.name,
                    oldColor: sector.color,
                    oldStreets,
                    newName: name,
                    newColor: color,
                    newStreets: streets
                })
            );
        });

        transaction();

        return res.json({
            success: true,
            message: "Secteur modifié."
        });

    } catch (error) {
        console.error("Erreur PUT /api/sectors/:id :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la modification du secteur."
        });
    }
});

/*
|--------------------------------------------------------------------------
| DELETE /api/sectors/:id
|--------------------------------------------------------------------------
|
| Supprime un secteur.
|
| Ancien comportement :
| - bloquait la suppression si le secteur était utilisé dans une campagne.
|
| Nouveau comportement :
| - supprime proprement toutes les données liées au secteur :
|   1. validations de rues
|   2. validations de secteur
|   3. liens campagne / secteur
|   4. rues du secteur
|   5. secteur
|
| Important :
| - les campagnes ne sont pas supprimées
| - seules les liaisons avec ce secteur sont supprimées
|
|--------------------------------------------------------------------------
*/

router.delete("/:id", requireAdmin, (req, res) => {
    try {
        const sectorId = Number(req.params.id);

        if (!sectorId) {
            return res.status(400).json({
                success: false,
                message: "Secteur invalide."
            });
        }

        const sector = db.prepare(`
            SELECT
                id,
                name,
                color
            FROM sectors
            WHERE id = ?
        `).get(sectorId);

        if (!sector) {
            return res.status(404).json({
                success: false,
                message: "Secteur introuvable."
            });
        }

        const streets = db.prepare(`
            SELECT
                id,
                name
            FROM streets
            WHERE sector_id = ?
            ORDER BY name ASC
        `).all(sectorId);

        const campaignLinks = db.prepare(`
            SELECT COUNT(*) AS total
            FROM campaign_sectors
            WHERE sector_id = ?
        `).get(sectorId).total;

        const sectorValidations = db.prepare(`
            SELECT COUNT(*) AS total
            FROM validations
            WHERE sector_id = ?
        `).get(sectorId).total;

        const streetValidations = db.prepare(`
            SELECT COUNT(*) AS total
            FROM street_validations
            WHERE sector_id = ?
        `).get(sectorId).total;

        const transaction = db.transaction(() => {
            /*
            |--------------------------------------------------------------------------
            | 1. Suppression des validations de rues
            |--------------------------------------------------------------------------
            */

            db.prepare(`
                DELETE FROM street_validations
                WHERE sector_id = ?
            `).run(sectorId);

            /*
            |--------------------------------------------------------------------------
            | 2. Suppression des validations du secteur
            |--------------------------------------------------------------------------
            */

            db.prepare(`
                DELETE FROM validations
                WHERE sector_id = ?
            `).run(sectorId);

            /*
            |--------------------------------------------------------------------------
            | 3. Suppression des liens entre campagnes et secteur
            |--------------------------------------------------------------------------
            |
            | On ne supprime pas les campagnes.
            | On retire seulement ce secteur des campagnes où il était utilisé.
            |
            |--------------------------------------------------------------------------
            */

            db.prepare(`
                DELETE FROM campaign_sectors
                WHERE sector_id = ?
            `).run(sectorId);

            /*
            |--------------------------------------------------------------------------
            | 4. Suppression des rues du secteur
            |--------------------------------------------------------------------------
            */

            db.prepare(`
                DELETE FROM streets
                WHERE sector_id = ?
            `).run(sectorId);

            /*
            |--------------------------------------------------------------------------
            | 5. Suppression du secteur
            |--------------------------------------------------------------------------
            */

            db.prepare(`
                DELETE FROM sectors
                WHERE id = ?
            `).run(sectorId);

            /*
            |--------------------------------------------------------------------------
            | Journalisation
            |--------------------------------------------------------------------------
            */

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
                req.session.user.id,
                "DELETE_SECTOR",
                "sector",
                sectorId,
                JSON.stringify({
                    name: sector.name,
                    color: sector.color,
                    streets,
                    removedCampaignLinks: campaignLinks,
                    removedSectorValidations: sectorValidations,
                    removedStreetValidations: streetValidations
                })
            );
        });

        transaction();

        return res.json({
            success: true,
            message: "Secteur supprimé."
        });

    } catch (error) {
        console.error("Erreur DELETE /api/sectors/:id :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la suppression du secteur."
        });
    }
});

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = router;