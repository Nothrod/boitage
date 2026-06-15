/*
|--------------------------------------------------------------------------
| Map Boitage - Routes Utilisateurs
|--------------------------------------------------------------------------
|
| Fichier : routes/users.js
|
| Rôle :
| Gérer les utilisateurs :
| - lister les utilisateurs
| - créer un utilisateur
| - générer un lien d'activation
| - attribuer un rôle : user / manager / admin
| - créer une équipe
| - lister les équipes
| - attribuer une ou plusieurs équipes à un utilisateur
| - modifier le rôle
| - modifier les équipes
| - supprimer un utilisateur
|
| Accès :
| - admin uniquement pour la gestion complète
|
|--------------------------------------------------------------------------
*/

const express = require("express");
const { v4: uuidv4 } = require("uuid");

const db = require("../db/db");

const {
    requireAuth,
    requireAdmin
} = require("../middleware/auth");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Récupérer les équipes d'un utilisateur
|--------------------------------------------------------------------------
*/

function getUserTeams(userId) {
    return db.prepare(`
        SELECT
            teams.id,
            teams.name
        FROM user_teams
        INNER JOIN teams
            ON teams.id = user_teams.team_id
        WHERE user_teams.user_id = ?
        ORDER BY teams.name ASC
    `).all(userId);
}

/*
|--------------------------------------------------------------------------
| Vérifier si un utilisateur est manager d'au moins une équipe
|--------------------------------------------------------------------------
*/

function isUserTeamManager(userId) {
    const user = db.prepare(`
        SELECT id
        FROM users
        WHERE id = ?
        AND role = 'manager'
        LIMIT 1
    `).get(userId);

    if (!user) {
        return false;
    }

    const team = db.prepare(`
        SELECT id
        FROM user_teams
        WHERE user_id = ?
        LIMIT 1
    `).get(userId);

    return Boolean(team);
}

/*
|--------------------------------------------------------------------------
| Nettoyer et vérifier les équipes
|--------------------------------------------------------------------------
*/

function validateTeamIds(teamIds) {
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
        return [];
    }

    const cleanTeamIds = [
        ...new Set(
            teamIds
                .map(id => Number(id))
                .filter(id => id > 0)
        )
    ];

    if (cleanTeamIds.length === 0) {
        return [];
    }

    const placeholders =
        cleanTeamIds.map(() => "?").join(",");

    const existingTeams = db.prepare(`
        SELECT id
        FROM teams
        WHERE id IN (${placeholders})
    `).all(...cleanTeamIds);

    const existingTeamIds =
        existingTeams.map(team => Number(team.id));

    return cleanTeamIds.filter(teamId => {
        return existingTeamIds.includes(teamId);
    });
}

/*
|--------------------------------------------------------------------------
| GET /api/users/me/teams
|--------------------------------------------------------------------------
|
| Retourne les équipes de l'utilisateur connecté.
| Utile pour le frontend et les permissions manager.
|
|--------------------------------------------------------------------------
*/

router.get("/me/teams", requireAuth, (req, res) => {
    try {
        const userId = Number(req.session.user.id);

        const teams = getUserTeams(userId);

        return res.json({
            success: true,
            teams,
            is_team_manager: isUserTeamManager(userId)
        });

    } catch (error) {
        console.error("Erreur GET /api/users/me/teams :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors du chargement de vos équipes."
        });
    }
});

/*
|--------------------------------------------------------------------------
| Protection admin pour toutes les routes suivantes
|--------------------------------------------------------------------------
*/

router.use(requireAdmin);

/*
|--------------------------------------------------------------------------
| GET /api/users/teams
|--------------------------------------------------------------------------
|
| Liste toutes les équipes.
|
|--------------------------------------------------------------------------
*/

router.get("/teams", (req, res) => {
    try {
        const teams = db.prepare(`
            SELECT
                id,
                name,
                created_at,
                updated_at
            FROM teams
            ORDER BY name ASC
        `).all();

        return res.json({
            success: true,
            teams
        });

    } catch (error) {
        console.error("Erreur GET /api/users/teams :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors du chargement des équipes."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/users/teams
|--------------------------------------------------------------------------
|
| Crée une nouvelle équipe.
|
|--------------------------------------------------------------------------
*/

router.post("/teams", (req, res) => {
    try {
        const name =
            String(req.body.name || "").trim();

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nom d'équipe obligatoire."
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

        const teamId =
            result.lastInsertRowid;

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
            JSON.stringify({
                name
            })
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
        console.error("Erreur POST /api/users/teams :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la création de l'équipe."
        });
    }
});

/*
|--------------------------------------------------------------------------
| PUT /api/users/teams/:id
|--------------------------------------------------------------------------
|
| Modifie le nom d'une équipe.
|
|--------------------------------------------------------------------------
*/

router.put("/teams/:id", (req, res) => {
    try {
        const teamId =
            Number(req.params.id);

        const name =
            String(req.body.name || "").trim();

        if (!teamId) {
            return res.status(400).json({
                success: false,
                message: "Équipe invalide."
            });
        }

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nom d'équipe obligatoire."
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
        console.error("Erreur PUT /api/users/teams/:id :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la modification de l'équipe."
        });
    }
});

/*
|--------------------------------------------------------------------------
| DELETE /api/users/teams/:id
|--------------------------------------------------------------------------
|
| Supprime une équipe si elle n'est pas utilisée.
|
|--------------------------------------------------------------------------
*/

router.delete("/teams/:id", (req, res) => {
    try {
        const teamId =
            Number(req.params.id);

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

        const usersCount = db.prepare(`
            SELECT COUNT(*) AS total
            FROM user_teams
            WHERE team_id = ?
        `).get(teamId).total;

        if (usersCount > 0) {
            return res.status(400).json({
                success: false,
                message: "Impossible de supprimer cette équipe car des utilisateurs y sont rattachés."
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
                message: "Impossible de supprimer cette équipe car des campagnes y sont rattachées."
            });
        }

        const sectorsCount = db.prepare(`
            SELECT COUNT(*) AS total
            FROM sectors
            WHERE team_id = ?
        `).get(teamId).total;

        if (sectorsCount > 0) {
            return res.status(400).json({
                success: false,
                message: "Impossible de supprimer cette équipe car des secteurs y sont rattachés."
            });
        }

        db.prepare(`
            DELETE FROM teams
            WHERE id = ?
        `).run(teamId);

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

        return res.json({
            success: true,
            message: "Équipe supprimée."
        });

    } catch (error) {
        console.error("Erreur DELETE /api/users/teams/:id :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la suppression de l'équipe."
        });
    }
});

/*
|--------------------------------------------------------------------------
| GET /api/users
|--------------------------------------------------------------------------
|
| Liste les utilisateurs avec leurs équipes.
|
|--------------------------------------------------------------------------
*/

router.get("/", (req, res) => {
    try {
        const users = db.prepare(`
            SELECT
                users.id,
                users.name,
                users.username,
                COALESCE(users.email, '') AS email,
                users.role,
                users.is_active,
                users.created_at,
                token_data.token
            FROM users
            LEFT JOIN (
                SELECT
                    user_id,
                    token,
                    MAX(created_at) AS latest_created_at
                FROM activation_tokens
                WHERE used_at IS NULL
                GROUP BY user_id
            ) AS token_data
                ON token_data.user_id = users.id
            ORDER BY users.id DESC
        `).all();

        const result = users.map(user => {
            return {
                ...user,
                teams: getUserTeams(user.id),
                is_team_manager: isUserTeamManager(user.id)
            };
        });

        return res.json({
            success: true,
            users: result
        });

    } catch (error) {
        console.error("Erreur GET /api/users :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors du chargement des utilisateurs."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/users
|--------------------------------------------------------------------------
|
| Crée un nouvel utilisateur.
|
|--------------------------------------------------------------------------
*/

router.post("/", (req, res) => {
    try {
        const {
            name,
            username,
            role,
            teamIds = []
        } = req.body;

        if (!name || !username) {
            return res.status(400).json({
                success: false,
                message: "Nom et identifiant requis."
            });
        }

        const cleanName =
            String(name).trim();

        const cleanUsername =
            String(username).trim().toLowerCase();

        const finalRole =
            ["user", "manager", "admin"].includes(role)
                ? role
                : "user";

        const cleanTeamIds =
            validateTeamIds(teamIds);

        if (!cleanName || !cleanUsername) {
            return res.status(400).json({
                success: false,
                message: "Nom et identifiant requis."
            });
        }

        if (finalRole !== "admin" && cleanTeamIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Un utilisateur ou manager doit appartenir à au moins une équipe."
            });
        }

        const existingUser = db.prepare(`
            SELECT id
            FROM users
            WHERE LOWER(username) = LOWER(?)
        `).get(cleanUsername);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Cet identifiant existe déjà."
            });
        }

        const token = uuidv4();

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const transaction = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO users (
                    name,
                    username,
                    role,
                    is_active,
                    created_at
                )
                VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
            `).run(
                cleanName,
                cleanUsername,
                finalRole
            );

            const userId =
                result.lastInsertRowid;

            const insertUserTeam = db.prepare(`
                INSERT OR IGNORE INTO user_teams (
                    user_id,
                    team_id,
                    created_at
                )
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);

            cleanTeamIds.forEach(teamId => {
                insertUserTeam.run(
                    userId,
                    teamId
                );
            });

            db.prepare(`
                INSERT INTO activation_tokens (
                    user_id,
                    token,
                    expires_at,
                    created_at
                )
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                userId,
                token,
                expiresAt.toISOString()
            );

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
                "CREATE_USER",
                "user",
                userId,
                JSON.stringify({
                    name: cleanName,
                    username: cleanUsername,
                    role: finalRole,
                    teamIds: cleanTeamIds
                })
            );

            return userId;
        });

        const userId =
            transaction();

        const appUrl =
            process.env.APP_URL || "http://localhost:3000";

        return res.status(201).json({
            success: true,
            message: "Utilisateur créé.",
            user: {
                id: userId,
                name: cleanName,
                username: cleanUsername,
                role: finalRole,
                is_active: 0,
                token,
                teams: getUserTeams(userId),
                is_team_manager: isUserTeamManager(userId)
            },
            activationLink: `${appUrl}/activate.html?token=${token}`
        });

    } catch (error) {
        console.error("Erreur POST /api/users :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la création de l'utilisateur."
        });
    }
});

/*
|--------------------------------------------------------------------------
| PUT /api/users/:id/role
|--------------------------------------------------------------------------
*/

router.put("/:id/role", (req, res) => {
    try {
        const userId =
            Number(req.params.id);

        const { role } =
            req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "Utilisateur invalide."
            });
        }

        if (!["user", "manager", "admin"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Rôle invalide."
            });
        }

        const user = db.prepare(`
            SELECT id, role
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Utilisateur introuvable."
            });
        }

        if (user.role === "admin" && role !== "admin") {
            const adminCount = db.prepare(`
                SELECT COUNT(*) AS total
                FROM users
                WHERE role = 'admin'
            `).get().total;

            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "Impossible de retirer le rôle du dernier administrateur."
                });
            }
        }

        const userTeams =
            getUserTeams(userId);

        if (role !== "admin" && userTeams.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Impossible de passer cet utilisateur en user ou manager sans équipe."
            });
        }

        db.prepare(`
            UPDATE users
            SET
                role = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(role, userId);

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
            "CHANGE_USER_ROLE",
            "user",
            userId,
            JSON.stringify({
                oldRole: user.role,
                newRole: role
            })
        );

        return res.json({
            success: true,
            message: "Rôle modifié."
        });

    } catch (error) {
        console.error("Erreur PUT /api/users/:id/role :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la modification du rôle."
        });
    }
});

/*
|--------------------------------------------------------------------------
| PUT /api/users/:id/teams
|--------------------------------------------------------------------------
*/

router.put("/:id/teams", (req, res) => {
    try {
        const userId =
            Number(req.params.id);

        const teamIds =
            Array.isArray(req.body.teamIds)
                ? req.body.teamIds
                : [];

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "Utilisateur invalide."
            });
        }

        const user = db.prepare(`
            SELECT id, name, username, role
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Utilisateur introuvable."
            });
        }

        const cleanTeamIds =
            validateTeamIds(teamIds);

        if (user.role !== "admin" && cleanTeamIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Un utilisateur ou manager doit avoir au moins une équipe."
            });
        }

        const transaction = db.transaction(() => {
            db.prepare(`
                DELETE FROM user_teams
                WHERE user_id = ?
            `).run(userId);

            const insertUserTeam = db.prepare(`
                INSERT OR IGNORE INTO user_teams (
                    user_id,
                    team_id,
                    created_at
                )
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);

            cleanTeamIds.forEach(teamId => {
                insertUserTeam.run(
                    userId,
                    teamId
                );
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
                "UPDATE_USER_TEAMS",
                "user",
                userId,
                JSON.stringify({
                    username: user.username,
                    teamIds: cleanTeamIds
                })
            );
        });

        transaction();

        return res.json({
            success: true,
            message: "Équipes de l'utilisateur modifiées.",
            teams: getUserTeams(userId),
            is_team_manager: isUserTeamManager(userId)
        });

    } catch (error) {
        console.error("Erreur PUT /api/users/:id/teams :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la modification des équipes."
        });
    }
});

/*
|--------------------------------------------------------------------------
| PUT /api/users/:id
|--------------------------------------------------------------------------
|
| Modifie en une seule fois :
| - le rôle
| - les équipes
|
| Cette route sera pratique pour ton futur popup "Modifier".
|
|--------------------------------------------------------------------------
*/

router.put("/:id", (req, res) => {
    try {
        const userId =
            Number(req.params.id);

        const {
            role,
            teamIds = []
        } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "Utilisateur invalide."
            });
        }

        if (!["user", "manager", "admin"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Rôle invalide."
            });
        }

        const user = db.prepare(`
            SELECT id, name, username, role
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Utilisateur introuvable."
            });
        }

        if (user.role === "admin" && role !== "admin") {
            const adminCount = db.prepare(`
                SELECT COUNT(*) AS total
                FROM users
                WHERE role = 'admin'
            `).get().total;

            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "Impossible de retirer le rôle du dernier administrateur."
                });
            }
        }

        const cleanTeamIds =
            validateTeamIds(teamIds);

        if (role !== "admin" && cleanTeamIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Un utilisateur ou manager doit avoir au moins une équipe."
            });
        }

        const transaction = db.transaction(() => {
            db.prepare(`
                UPDATE users
                SET
                    role = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(role, userId);

            db.prepare(`
                DELETE FROM user_teams
                WHERE user_id = ?
            `).run(userId);

            const insertUserTeam = db.prepare(`
                INSERT OR IGNORE INTO user_teams (
                    user_id,
                    team_id,
                    created_at
                )
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);

            cleanTeamIds.forEach(teamId => {
                insertUserTeam.run(
                    userId,
                    teamId
                );
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
                "UPDATE_USER",
                "user",
                userId,
                JSON.stringify({
                    username: user.username,
                    oldRole: user.role,
                    newRole: role,
                    teamIds: cleanTeamIds
                })
            );
        });

        transaction();

        return res.json({
            success: true,
            message: "Utilisateur modifié.",
            user: {
                id: userId,
                role,
                teams: getUserTeams(userId),
                is_team_manager: isUserTeamManager(userId)
            }
        });

    } catch (error) {
        console.error("Erreur PUT /api/users/:id :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la modification de l'utilisateur."
        });
    }
});

/*
|--------------------------------------------------------------------------
| DELETE /api/users/:id
|--------------------------------------------------------------------------
*/

router.delete("/:id", (req, res) => {
    try {
        const userId =
            Number(req.params.id);

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "Utilisateur invalide."
            });
        }

        if (Number(req.session.user.id) === userId) {
            return res.status(400).json({
                success: false,
                message: "Vous ne pouvez pas supprimer votre propre compte."
            });
        }

        const user = db.prepare(`
            SELECT id, role, name, username
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Utilisateur introuvable."
            });
        }

        if (user.role === "admin") {
            const adminCount = db.prepare(`
                SELECT COUNT(*) AS total
                FROM users
                WHERE role = 'admin'
            `).get().total;

            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "Impossible de supprimer le dernier administrateur."
                });
            }
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
                "DELETE_USER",
                "user",
                userId,
                JSON.stringify({
                    name: user.name,
                    username: user.username,
                    role: user.role
                })
            );

            db.prepare(`
                DELETE FROM activation_tokens
                WHERE user_id = ?
            `).run(userId);

            db.prepare(`
                DELETE FROM password_reset_tokens
                WHERE user_id = ?
            `).run(userId);

            db.prepare(`
                DELETE FROM user_teams
                WHERE user_id = ?
            `).run(userId);

            db.prepare(`
                DELETE FROM users
                WHERE id = ?
            `).run(userId);
        });

        transaction();

        return res.json({
            success: true,
            message: "Utilisateur supprimé."
        });

    } catch (error) {
        console.error("Erreur DELETE /api/users/:id :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la suppression de l'utilisateur."
        });
    }
});

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = router;