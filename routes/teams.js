/*
|--------------------------------------------------------------------------
| Map Boitage - Routes Équipes
|--------------------------------------------------------------------------
|
| Fichier : routes/teams.js
|
| Rôle :
| Gérer les équipes de l'application.
|
| Fonctionnalités :
| - lister les équipes
| - créer une équipe
| - modifier une équipe
| - supprimer une équipe
|
| Accès :
| - admin uniquement pour créer / modifier / supprimer
| - utilisateur connecté pour lister les équipes
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
| GET /api/teams
|--------------------------------------------------------------------------
|
| Liste les équipes.
|
| Admin :
| - voit toutes les équipes
|
| Manager / User :
| - voit uniquement ses équipes
|
|--------------------------------------------------------------------------
*/

router.get("/", requireAuth, (req, res) => {
    try {
        const user = req.session.user;

        let teams = [];

        if (user.role === "admin") {
            teams = db.prepare(`
                SELECT
                    id,
                    name,
                    created_at,
                    updated_at
                FROM teams
                ORDER BY name ASC
            `).all();
        } else {
            const teamIds = Array.isArray(user.teamIds)
                ? user.teamIds.map(id => Number(id)).filter(Boolean)
                : [];

            if (teamIds.length === 0) {
                return res.json({
                    success: true,
                    teams: []
                });
            }

            const placeholders = teamIds.map(() => "?").join(",");

            teams = db.prepare(`
                SELECT
                    id,
                    name,
                    created_at,
                    updated_at
                FROM teams
                WHERE id IN (${placeholders})
                ORDER BY name ASC
            `).all(...teamIds);
        }

        return res.json({
            success: true,
            teams
        });

    } catch (error) {
        console.error("Erreur GET /api/teams :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors du chargement des équipes."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/teams
|--------------------------------------------------------------------------
|
| Crée une équipe.
|
| Admin uniquement.
|
|--------------------------------------------------------------------------
*/

router.post("/", requireAdmin, (req, res) => {
    try {
        const name = req.body.name
            ? String(req.body.name).trim()
            : "";

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nom de l'équipe requis."
            });
        }

        const existingTeam = db.prepare(`
            SELECT id
            FROM teams
            WHERE LOWER(name) = LOWER(?)
        `).get(name);

        if (existingTeam) {
            return res.status(409).json({
                success: false,
                message: "Cette équipe existe déjà."
            });
        }

        const result = db.prepare(`
            INSERT INTO teams (
                name,
                created_at
            )
            VALUES (?, CURRENT_TIMESTAMP)
        `).run(name);

        const teamId = result.lastInsertRowid;

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
            "CREATE_TEAM",
            "team",
            teamId,
            JSON.stringify({ name })
        );

        return res.status(201).json({
            success: true,
            message: "Équipe créée.",
            team: {
                id: teamId,
                name
            }
        });

    } catch (error) {
        console.error("Erreur POST /api/teams :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la création de l'équipe."
        });
    }
});

/*
|--------------------------------------------------------------------------
| PUT /api/teams/:id
|--------------------------------------------------------------------------
|
| Modifie le nom d'une équipe.
|
| Admin uniquement.
|
|--------------------------------------------------------------------------
*/

router.put("/:id", requireAdmin, (req, res) => {
    try {
        const teamId = Number(req.params.id);

        const name = req.body.name
            ? String(req.body.name).trim()
            : "";

        if (!teamId) {
            return res.status(400).json({
                success: false,
                message: "Équipe invalide."
            });
        }

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nom de l'équipe requis."
            });
        }

        const team = db.prepare(`
            SELECT id, name
            FROM teams
            WHERE id = ?
        `).get(teamId);

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Équipe introuvable."
            });
        }

        const duplicate = db.prepare(`
            SELECT id
            FROM teams
            WHERE LOWER(name) = LOWER(?)
            AND id != ?
        `).get(name, teamId);

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: "Une autre équipe porte déjà ce nom."
            });
        }

        db.prepare(`
            UPDATE teams
            SET
                name = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, teamId);

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
            "UPDATE_TEAM",
            "team",
            teamId,
            JSON.stringify({
                oldName: team.name,
                newName: name
            })
        );

        return res.json({
            success: true,
            message: "Équipe modifiée."
        });

    } catch (error) {
        console.error("Erreur PUT /api/teams/:id :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la modification de l'équipe."
        });
    }
});

/*
|--------------------------------------------------------------------------
| DELETE /api/teams/:id
|--------------------------------------------------------------------------
|
| Supprime une équipe.
|
| Sécurité :
| - impossible si des campagnes sont liées à cette équipe
| - les liens user_teams sont supprimés automatiquement
|
| Admin uniquement.
|
|--------------------------------------------------------------------------
*/

router.delete("/:id", requireAdmin, (req, res) => {
    try {
        const teamId = Number(req.params.id);

        if (!teamId) {
            return res.status(400).json({
                success: false,
                message: "Équipe invalide."
            });
        }

        const team = db.prepare(`
            SELECT id, name
            FROM teams
            WHERE id = ?
        `).get(teamId);

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Équipe introuvable."
            });
        }

        const campaignsCount = db.prepare(`
            SELECT COUNT(*) AS total
            FROM campaigns
            WHERE team_id = ?
        `).get(teamId).total;

        if (campaignsCount > 0) {
            return res.status(400).json({
                success: false,
                message: "Impossible de supprimer cette équipe car elle est utilisée par une ou plusieurs campagnes."
            });
        }

        const transaction = db.transaction(() => {
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
                "DELETE_TEAM",
                "team",
                teamId,
                JSON.stringify({
                    name: team.name
                })
            );

            db.prepare(`
                DELETE FROM user_teams
                WHERE team_id = ?
            `).run(teamId);

            db.prepare(`
                DELETE FROM teams
                WHERE id = ?
            `).run(teamId);
        });

        transaction();

        return res.json({
            success: true,
            message: "Équipe supprimée."
        });

    } catch (error) {
        console.error("Erreur DELETE /api/teams/:id :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la suppression de l'équipe."
        });
    }
});

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = router;