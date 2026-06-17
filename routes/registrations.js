/*
|--------------------------------------------------------------------------
| Map Boitage - Routes Demandes d'inscription
|--------------------------------------------------------------------------
*/

const express = require("express");
const { v4: uuidv4 } = require("uuid");

const db = require("../db/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| POST /api/register
|--------------------------------------------------------------------------
|
| Soumettre une demande de création de compte (public).
|
|--------------------------------------------------------------------------
*/

router.post("/register", (req, res) => {
    try {
        const { name, username, email, teamIds = [] } = req.body;

        if (!name || !username || !email) {
            return res.status(400).json({
                success: false,
                message: "Nom, identifiant et email requis."
            });
        }

        const cleanName = String(name).trim();
        const cleanUsername = String(username).trim().toLowerCase();
        const cleanEmail = String(email).trim().toLowerCase();

        // Vérifier format email
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: "Adresse email invalide."
            });
        }

        // Vérifier si l'identifiant existe déjà
        const existingUser = db.prepare(`
            SELECT id FROM users WHERE LOWER(username) = LOWER(?)
        `).get(cleanUsername);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Cet identifiant existe déjà."
            });
        }

        // Vérifier si une demande existe déjà
        const existingRequest = db.prepare(`
            SELECT id FROM registration_requests 
            WHERE LOWER(username) = LOWER(?) AND status = 'pending'
        `).get(cleanUsername);

        if (existingRequest) {
            return res.status(409).json({
                success: false,
                message: "Une demande est déjà en cours pour cet identifiant."
            });
        }

        // Valider les équipes
        let cleanTeamIds = [];
        if (Array.isArray(teamIds) && teamIds.length > 0) {
            cleanTeamIds = [
                ...new Set(
                    teamIds
                        .map(id => Number(id))
                        .filter(id => id > 0)
                )
            ];

            if (cleanTeamIds.length > 0) {
                const placeholders = cleanTeamIds.map(() => "?").join(",");
                const existingTeams = db.prepare(`
                    SELECT id FROM teams WHERE id IN (${placeholders})
                `).all(...cleanTeamIds);
                
                cleanTeamIds = cleanTeamIds.filter(id => 
                    existingTeams.some(t => t.id === id)
                );
            }
        }

        if (cleanTeamIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Vous devez sélectionner au moins une équipe."
            });
        }

        // Créer la demande
const requestToken = uuidv4();

const result = db.prepare(`
    INSERT INTO registration_requests (
        name, username, email, team_ids, token, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
`).run(
    cleanName,
    cleanUsername,
    cleanEmail,
    JSON.stringify(cleanTeamIds),
    requestToken
);

        const requestId = result.lastInsertRowid;

        // Log
        db.prepare(`
            INSERT INTO logs (
                user_id, action, entity_type, entity_id, details, created_at
            )
            VALUES (NULL, ?, 'registration_request', ?, ?, CURRENT_TIMESTAMP)
        `).run(
            "CREATE_REGISTRATION_REQUEST",
            requestId,
            JSON.stringify({
                name: cleanName,
                username: cleanUsername,
                email: cleanEmail,
                teamIds: cleanTeamIds
            })
        );

        return res.status(201).json({
            success: true,
            message: "Votre demande d'inscription a été soumise. Vous recevrez un email lors de la validation.",
            requestId
        });

    } catch (error) {
        console.error("Erreur POST /api/register :", error);
        return res.status(500).json({
            success: false,
            message: "Erreur lors de la soumission de la demande."
        });
    }
});

/*
|--------------------------------------------------------------------------
| GET /api/registrations
|--------------------------------------------------------------------------
|
| Lister toutes les demandes d'inscription (admin uniquement).
|
|--------------------------------------------------------------------------
*/

router.get("/registrations", requireAdmin, (req, res) => {
    try {
        const requests = db.prepare(`
            SELECT 
                id, name, username, email, team_ids, status,
                processed_by, processed_at, created_at
            FROM registration_requests
            ORDER BY 
                CASE status 
                    WHEN 'pending' THEN 0 
                    WHEN 'approved' THEN 1 
                    WHEN 'rejected' THEN 2 
                END,
                created_at DESC
        `).all();

        const result = requests.map(request => {
            let teamIds = [];
            try {
                teamIds = JSON.parse(request.team_ids || "[]");
            } catch {
                teamIds = [];
            }

            let teams = [];
            if (teamIds.length > 0) {
                const placeholders = teamIds.map(() => "?").join(",");
                teams = db.prepare(`
                    SELECT id, name FROM teams WHERE id IN (${placeholders})
                `).all(...teamIds);
            }

            let processedByUser = null;
            if (request.processed_by) {
                processedByUser = db.prepare(`
                    SELECT id, name, username FROM users WHERE id = ?
                `).get(request.processed_by);
            }

            return {
                ...request,
                teams,
                processedByUser
            };
        });

        return res.json({
            success: true,
            registrations: result
        });

    } catch (error) {
        console.error("Erreur GET /api/registrations :", error);
        return res.status(500).json({
            success: false,
            message: "Erreur lors du chargement des demandes."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/registrations/:id/approve
|--------------------------------------------------------------------------
|
| Approuver une demande (admin uniquement).
|
|--------------------------------------------------------------------------
*/

router.post("/registrations/:id/approve", requireAdmin, (req, res) => {
    try {
        const requestId = Number(req.params.id);

        if (!requestId) {
            return res.status(400).json({
                success: false,
                message: "Demande invalide."
            });
        }

        const request = db.prepare(`
            SELECT * FROM registration_requests WHERE id = ?
        `).get(requestId);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Demande introuvable."
            });
        }

        if (request.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Cette demande a déjà été traitée."
            });
        }

        const existingUser = db.prepare(`
            SELECT id FROM users WHERE LOWER(username) = LOWER(?)
        `).get(request.username);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Un utilisateur avec cet identifiant existe déjà."
            });
        }

        let teamIds = [];
        try {
            teamIds = JSON.parse(request.team_ids || "[]");
        } catch {
            teamIds = [];
        }

        const transaction = db.transaction(() => {
    const result = db.prepare(`
        INSERT INTO users (
            name, username, email, role, is_active, created_at
        )
        VALUES (?, ?, ?, 'user', 0, CURRENT_TIMESTAMP)
    `).run(
        request.name,
        request.username,
        request.email
    );

    const userId = result.lastInsertRowid;

    const insertUserTeam = db.prepare(`
        INSERT OR IGNORE INTO user_teams (
            user_id, team_id, created_at
        )
        VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    teamIds.forEach(teamId => {
        insertUserTeam.run(userId, teamId);
    });

    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    db.prepare(`
        INSERT INTO activation_tokens (
            user_id, token, expires_at, created_at
        )
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, token, expiresAt.toISOString());

            db.prepare(`
                UPDATE registration_requests
                SET 
                    status = 'approved',
                    processed_by = ?,
                    processed_at = CURRENT_TIMESTAMP,
                    user_id = ?
                WHERE id = ?
            `).run(
                req.session.user.id,
                userId,
                requestId
            );

            db.prepare(`
                INSERT INTO logs (
                    user_id, action, entity_type, entity_id, details, created_at
                )
                VALUES (?, ?, 'registration_request', ?, ?, CURRENT_TIMESTAMP)
            `).run(
                req.session.user.id,
                "APPROVE_REGISTRATION",
                requestId,
                JSON.stringify({
                    username: request.username,
                    userId
                })
            );

            return { userId, token };
        });

        const { userId, token } = transaction();

        const appUrl = process.env.APP_URL || "http://localhost:3000";
        const activationLink = `${appUrl}/activate.html?token=${token}`;

        return res.json({
            success: true,
            message: "Demande approuvée. L'utilisateur peut maintenant activer son compte.",
            activationLink,
            userId
        });

    } catch (error) {
        console.error("Erreur POST /api/registrations/:id/approve :", error);
        return res.status(500).json({
            success: false,
            message: "Erreur lors de l'approbation de la demande."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/registrations/:id/reject
|--------------------------------------------------------------------------
|
| Rejeter une demande (admin uniquement).
|
|--------------------------------------------------------------------------
*/

router.post("/registrations/:id/reject", requireAdmin, (req, res) => {
    try {
        const requestId = Number(req.params.id);

        if (!requestId) {
            return res.status(400).json({
                success: false,
                message: "Demande invalide."
            });
        }

        const request = db.prepare(`
            SELECT * FROM registration_requests WHERE id = ?
        `).get(requestId);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Demande introuvable."
            });
        }

        if (request.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Cette demande a déjà été traitée."
            });
        }

        const transaction = db.transaction(() => {
            db.prepare(`
                UPDATE registration_requests
                SET 
                    status = 'rejected',
                    processed_by = ?,
                    processed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                req.session.user.id,
                requestId
            );

            db.prepare(`
                INSERT INTO logs (
                    user_id, action, entity_type, entity_id, details, created_at
                )
                VALUES (?, ?, 'registration_request', ?, ?, CURRENT_TIMESTAMP)
            `).run(
                req.session.user.id,
                "REJECT_REGISTRATION",
                requestId,
                JSON.stringify({
                    username: request.username
                })
            );
        });

        transaction();

        return res.json({
            success: true,
            message: "Demande rejetée."
        });

    } catch (error) {
        console.error("Erreur POST /api/registrations/:id/reject :", error);
        return res.status(500).json({
            success: false,
            message: "Erreur lors du rejet de la demande."
        });
    }
});

/*
|--------------------------------------------------------------------------
| GET /api/teams/public
|--------------------------------------------------------------------------
|
| Lister les équipes pour le formulaire d'inscription (public).
|
|--------------------------------------------------------------------------
*/

router.get("/teams/public", (req, res) => {
    try {
        const teams = db.prepare(`
            SELECT id, name FROM teams ORDER BY name ASC
        `).all();

        return res.json({
            success: true,
            teams
        });

    } catch (error) {
        console.error("Erreur GET /api/teams/public :", error);
        return res.status(500).json({
            success: false,
            message: "Erreur lors du chargement des équipes."
        });
    }
});

module.exports = router;