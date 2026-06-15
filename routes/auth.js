/*
|--------------------------------------------------------------------------
| Map Boitage - Routes Authentification
|--------------------------------------------------------------------------
|
| Fichier : routes/auth.js
|
| Rôle :
| Gérer :
| - la session utilisateur
| - la connexion
| - la déconnexion
| - le profil utilisateur
| - l'activation de compte
| - la récupération de mot de passe par email
| - la réinitialisation de mot de passe
|
| Équipes :
| - un utilisateur peut appartenir à plusieurs équipes
| - les équipes sont chargées à la connexion
| - la session contient teamIds pour filtrer les campagnes ensuite
|
|--------------------------------------------------------------------------
*/

const express = require("express");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");

const db = require("../db/db");

const {
    requireAuth
} = require("../middleware/auth");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Configuration email
|--------------------------------------------------------------------------
*/

const mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",

    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/*
|--------------------------------------------------------------------------
| Message neutre sécurité
|--------------------------------------------------------------------------
*/

const RESET_MESSAGE =
    "Si un compte actif possède un email renseigné, un lien de réinitialisation a été envoyé.";

/*
|--------------------------------------------------------------------------
| Chargement des équipes d'un utilisateur
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
| Construction propre de l'utilisateur de session
|--------------------------------------------------------------------------
*/

function buildSessionUser(user) {
    const teams = getUserTeams(user.id);

    return {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        teams,
        teamIds: teams.map(team => Number(team.id))
    };
}

/*
|--------------------------------------------------------------------------
| GET /api/me
|--------------------------------------------------------------------------
*/

router.get("/me", (req, res) => {
    if (!req.session || !req.session.user) {
        return res.json(null);
    }

    return res.json(req.session.user);
});

/*
|--------------------------------------------------------------------------
| GET /api/profile
|--------------------------------------------------------------------------
*/

router.get("/profile", requireAuth, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT
                id,
                name,
                username,
                COALESCE(email, '') AS email,
                role
            FROM users
            WHERE id = ?
        `).get(req.session.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Utilisateur introuvable."
            });
        }

        const teams = getUserTeams(user.id);

        return res.json({
            success: true,
            user: {
                ...user,
                teams,
                teamIds: teams.map(team => Number(team.id))
            }
        });

    } catch (error) {
        console.error("Erreur GET /api/profile :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors du chargement du profil."
        });
    }
});

/*
|--------------------------------------------------------------------------
| PUT /api/profile
|--------------------------------------------------------------------------
*/

router.put("/profile", requireAuth, async (req, res) => {
    try {
        const {
            email = "",
            currentPassword = "",
            newPassword = "",
            confirmPassword = ""
        } = req.body;

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(req.session.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Utilisateur introuvable."
            });
        }

        const cleanEmail = String(email).trim().toLowerCase();

        if (
            cleanEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Adresse email invalide."
            });
        }

        const wantsPasswordChange =
            currentPassword || newPassword || confirmPassword;

        if (wantsPasswordChange) {
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: "Mot de passe actuel requis."
                });
            }

            if (!newPassword) {
                return res.status(400).json({
                    success: false,
                    message: "Nouveau mot de passe requis."
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: "Le nouveau mot de passe doit contenir au moins 8 caractères."
                });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: "La confirmation du mot de passe ne correspond pas."
                });
            }

            const validPassword = await bcrypt.compare(
                currentPassword,
                user.password_hash
            );

            if (!validPassword) {
                return res.status(401).json({
                    success: false,
                    message: "Mot de passe actuel incorrect."
                });
            }

            const passwordHash = await bcrypt.hash(newPassword, 10);

            db.prepare(`
                UPDATE users
                SET
                    email = ?,
                    password_hash = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(cleanEmail, passwordHash, user.id);

        } else {
            db.prepare(`
                UPDATE users
                SET
                    email = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(cleanEmail, user.id);
        }

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
            user.id,
            "UPDATE_PROFILE",
            "user",
            user.id,
            JSON.stringify({
                emailUpdated: cleanEmail !== (user.email || ""),
                passwordUpdated: Boolean(wantsPasswordChange)
            })
        );

        return res.json({
            success: true,
            message: "Profil mis à jour."
        });

    } catch (error) {
        console.error("Erreur PUT /api/profile :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la mise à jour du profil."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/login
|--------------------------------------------------------------------------
*/

router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Nom d'utilisateur et mot de passe requis."
            });
        }

        const cleanUsername = String(username).trim().toLowerCase();

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE username = ?
        `).get(cleanUsername);

        if (!user || !user.password_hash) {
            return res.status(401).json({
                success: false,
                message: "Identifiants invalides."
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "Compte non activé."
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: "Identifiants invalides."
            });
        }

        req.session.user = buildSessionUser(user);

        req.session.save((err) => {
            if (err) {
                console.error("Erreur sauvegarde session :", err);

                return res.status(500).json({
                    success: false,
                    message: "Erreur lors de la connexion."
                });
            }

            return res.json({
                success: true,
                message: "Connexion réussie.",
                user: req.session.user
            });
        });

    } catch (error) {
        console.error("Erreur login :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur serveur."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/logout
|--------------------------------------------------------------------------
*/

router.post("/logout", (req, res) => {
    if (!req.session) {
        res.clearCookie("map_boitage_session", {
            path: "/"
        });

        return res.json({
            success: true,
            message: "Déconnexion réussie."
        });
    }

    req.session.user = null;

    req.session.destroy((err) => {
        if (err) {
            console.error("Erreur logout :", err);

            return res.status(500).json({
                success: false,
                message: "Erreur lors de la déconnexion."
            });
        }

        res.clearCookie("map_boitage_session", {
            path: "/"
        });

        return res.json({
            success: true,
            message: "Déconnexion réussie."
        });
    });
});

/*
|--------------------------------------------------------------------------
| GET /api/activate/:token
|--------------------------------------------------------------------------
*/

router.get("/activate/:token", (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Token manquant."
            });
        }

        const activation = db.prepare(`
            SELECT
                activation_tokens.id,
                activation_tokens.expires_at,
                activation_tokens.used_at,
                users.name,
                users.username,
                users.is_active
            FROM activation_tokens
            INNER JOIN users
                ON users.id = activation_tokens.user_id
            WHERE activation_tokens.token = ?
        `).get(token);

        if (!activation) {
            return res.status(400).json({
                success: false,
                message: "Lien d'activation invalide."
            });
        }

        if (activation.used_at || activation.is_active) {
            return res.status(400).json({
                success: false,
                message: "Ce compte est déjà activé."
            });
        }

        if (new Date(activation.expires_at) < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Lien expiré."
            });
        }

        return res.json({
            success: true,
            name: activation.name,
            username: activation.username
        });

    } catch (error) {
        console.error("Erreur GET /api/activate/:token :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur serveur."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/activate
|--------------------------------------------------------------------------
|
| Activation du compte :
| - vérifie le token
| - enregistre le mot de passe
| - enregistre l'email si renseigné
| - active le compte
| - invalide le token
|
|--------------------------------------------------------------------------
*/

router.post("/activate", async (req, res) => {
    try {
        const {
            token,
            password,
            email = ""
        } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "Informations manquantes."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Le mot de passe doit contenir au moins 8 caractères."
            });
        }

        const cleanEmail = String(email)
            .trim()
            .toLowerCase();

        if (
            cleanEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Adresse email invalide."
            });
        }

        const activationToken = db.prepare(`
            SELECT *
            FROM activation_tokens
            WHERE token = ?
        `).get(token);

        if (!activationToken) {
            return res.status(400).json({
                success: false,
                message: "Lien d'activation invalide."
            });
        }

        if (activationToken.used_at) {
            return res.status(400).json({
                success: false,
                message: "Lien déjà utilisé."
            });
        }

        if (new Date(activationToken.expires_at) < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Lien expiré."
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const transaction = db.transaction(() => {

            db.prepare(`
                UPDATE users
                SET
                    password_hash = ?,
                    email = ?,
                    is_active = 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                passwordHash,
                cleanEmail || null,
                activationToken.user_id
            );

            db.prepare(`
                UPDATE activation_tokens
                SET used_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                activationToken.id
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
                activationToken.user_id,
                "ACTIVATE_ACCOUNT",
                "user",
                activationToken.user_id,
                JSON.stringify({
                    email: cleanEmail || null,
                    message: "Compte activé par l'utilisateur"
                })
            );
        });

        transaction();

        return res.json({
            success: true,
            message: "Compte activé avec succès."
        });

    } catch (error) {
        console.error("Erreur POST /api/activate :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur serveur."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/forgot-password
|--------------------------------------------------------------------------
*/

router.post("/forgot-password", async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: "Identifiant requis."
            });
        }

        const cleanUsername = String(username).trim().toLowerCase();

        const user = db.prepare(`
            SELECT
                id,
                name,
                username,
                email,
                is_active
            FROM users
            WHERE username = ?
        `).get(cleanUsername);

        if (!user || !user.is_active || !user.email) {
            return res.json({
                success: true,
                message: RESET_MESSAGE
            });
        }

        db.prepare(`
            UPDATE password_reset_tokens
            SET used_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            AND used_at IS NULL
        `).run(user.id);

        const token = uuidv4();

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        db.prepare(`
            INSERT INTO password_reset_tokens (
                user_id,
                token,
                expires_at,
                created_at
            )
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
            user.id,
            token,
            expiresAt.toISOString()
        );

        const appUrl = process.env.APP_URL || "http://localhost:3000";
        const resetLink = `${appUrl}/reset.html?token=${token}`;

        await mailTransporter.sendMail({
            from: process.env.MAIL_FROM || process.env.SMTP_USER,
            to: user.email,
            subject: "Réinitialisation de votre mot de passe - Map Boitage",
            text: `
Bonjour ${user.name},

Vous avez demandé la réinitialisation de votre mot de passe Map Boitage.

Cliquez sur ce lien pour choisir un nouveau mot de passe :
${resetLink}

Ce lien est valable 1 heure.

Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.

Map Boitage
            `.trim()
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
            user.id,
            "REQUEST_PASSWORD_RESET",
            "user",
            user.id,
            JSON.stringify({
                message: "Lien de réinitialisation envoyé par email"
            })
        );

        return res.json({
            success: true,
            message: RESET_MESSAGE
        });

    } catch (error) {
        console.error("Erreur POST /api/forgot-password :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de l'envoi du lien de réinitialisation."
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/reset-password
|--------------------------------------------------------------------------
*/

router.post("/reset-password", async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "Informations manquantes."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Le mot de passe doit contenir au moins 8 caractères."
            });
        }

        const resetToken = db.prepare(`
            SELECT
                password_reset_tokens.id,
                password_reset_tokens.user_id,
                password_reset_tokens.expires_at,
                password_reset_tokens.used_at,
                users.is_active
            FROM password_reset_tokens
            INNER JOIN users
                ON users.id = password_reset_tokens.user_id
            WHERE password_reset_tokens.token = ?
        `).get(token);

        if (!resetToken) {
            return res.status(400).json({
                success: false,
                message: "Lien de réinitialisation invalide."
            });
        }

        if (resetToken.used_at) {
            return res.status(400).json({
                success: false,
                message: "Lien déjà utilisé."
            });
        }

        if (!resetToken.is_active) {
            return res.status(400).json({
                success: false,
                message: "Compte non activé."
            });
        }

        if (new Date(resetToken.expires_at) < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Lien expiré."
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const transaction = db.transaction(() => {
            db.prepare(`
                UPDATE users
                SET
                    password_hash = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(passwordHash, resetToken.user_id);

            db.prepare(`
                UPDATE password_reset_tokens
                SET used_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(resetToken.id);

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
                resetToken.user_id,
                "RESET_PASSWORD",
                "user",
                resetToken.user_id,
                JSON.stringify({
                    message: "Mot de passe réinitialisé"
                })
            );
        });

        transaction();

        return res.json({
            success: true,
            message: "Mot de passe modifié avec succès."
        });

    } catch (error) {
        console.error("Erreur POST /api/reset-password :", error);

        return res.status(500).json({
            success: false,
            message: "Erreur lors de la réinitialisation du mot de passe."
        });
    }
});

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = router;