/*
|--------------------------------------------------------------------------
| Map Boitage - Middleware d'authentification
|--------------------------------------------------------------------------
|
| Fichier : middleware/auth.js
|
| Rôle :
| Vérifier les droits d'accès avant d'entrer dans certaines routes.
|
| Fonctions disponibles :
|
| requireAuth
| -> utilisateur connecté obligatoire
|
| requireAdmin
| -> administrateur obligatoire
|
| requireManagerOrAdmin
| -> manager ou administrateur obligatoire
|
| requireRole
| -> vérifier dynamiquement un ou plusieurs rôles
|
| getSessionTeamIds
| -> récupérer les équipes de l'utilisateur connecté depuis la session
|
| userHasTeam
| -> vérifier si l'utilisateur connecté appartient à une équipe
|
| userCanManageTeam
| -> vérifier si l'utilisateur peut gérer une équipe
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Vérification utilisateur connecté
|--------------------------------------------------------------------------
|
| Vérifie simplement qu'une session utilisateur existe.
|
| Si aucune session :
| - retourne une erreur 401
| - empêche l'accès à la route demandée
|
|--------------------------------------------------------------------------
*/

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Authentification requise."
        });
    }

    next();
}

/*
|--------------------------------------------------------------------------
| Vérification administrateur
|--------------------------------------------------------------------------
|
| Autorise uniquement les utilisateurs avec le rôle :
| - admin
|
|--------------------------------------------------------------------------
*/

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Authentification requise."
        });
    }

    if (req.session.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Accès réservé aux administrateurs."
        });
    }

    next();
}

/*
|--------------------------------------------------------------------------
| Vérification manager ou administrateur
|--------------------------------------------------------------------------
|
| Autorise uniquement :
| - admin
| - manager
|
| Utilisé pour les routes qui doivent être accessibles aux admins
| et aux responsables d'équipe.
|
|--------------------------------------------------------------------------
*/

function requireManagerOrAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Authentification requise."
        });
    }

    if (!["manager", "admin"].includes(req.session.user.role)) {
        return res.status(403).json({
            success: false,
            message: "Accès réservé aux managers et administrateurs."
        });
    }

    next();
}

/*
|--------------------------------------------------------------------------
| Vérification dynamique d'un ou plusieurs rôles
|--------------------------------------------------------------------------
|
| Permet de protéger une route avec une liste de rôles autorisés.
|
| Exemple :
|
| router.post(
|     "/",
|     requireRole("admin", "manager"),
|     (req, res) => {
|         ...
|     }
| );
|
|--------------------------------------------------------------------------
*/

function requireRole(...allowedRoles) {
    return function (req, res, next) {
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Authentification requise."
            });
        }

        if (!allowedRoles.includes(req.session.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Accès refusé."
            });
        }

        next();
    };
}

/*
|--------------------------------------------------------------------------
| Récupération des équipes de la session
|--------------------------------------------------------------------------
|
| La session doit être alimentée au moment du login dans routes/auth.js.
|
| Format attendu :
|
| req.session.user.teamIds = [1, 2, 3]
|
| Sécurité :
| - si aucune session : []
| - si teamIds n'est pas un tableau : []
| - convertit tout en Number
| - supprime les valeurs invalides
|
|--------------------------------------------------------------------------
*/

function getSessionTeamIds(req) {
    if (!req.session || !req.session.user) {
        return [];
    }

    if (!Array.isArray(req.session.user.teamIds)) {
        return [];
    }

    return req.session.user.teamIds
        .map(teamId => Number(teamId))
        .filter(teamId => Number.isInteger(teamId) && teamId > 0);
}

/*
|--------------------------------------------------------------------------
| Vérification appartenance à une équipe
|--------------------------------------------------------------------------
|
| Admin :
| - retourne toujours true
|
| Manager / User :
| - retourne true uniquement si teamId est dans req.session.user.teamIds
|
|--------------------------------------------------------------------------
*/

function userHasTeam(req, teamId) {
    if (!req.session || !req.session.user) {
        return false;
    }

    if (req.session.user.role === "admin") {
        return true;
    }

    const cleanTeamId = Number(teamId);

    if (!Number.isInteger(cleanTeamId) || cleanTeamId <= 0) {
        return false;
    }

    const teamIds = getSessionTeamIds(req);

    return teamIds.includes(cleanTeamId);
}

/*
|--------------------------------------------------------------------------
| Vérification manager d'une équipe ou administrateur
|--------------------------------------------------------------------------
|
| Admin :
| - accès total
|
| Manager :
| - accès uniquement si la teamId demandée est dans ses équipes
|
| User :
| - refusé
|
|--------------------------------------------------------------------------
*/

function userCanManageTeam(req, teamId) {
    if (!req.session || !req.session.user) {
        return false;
    }

    if (req.session.user.role === "admin") {
        return true;
    }

    if (req.session.user.role !== "manager") {
        return false;
    }

    return userHasTeam(req, teamId);
}

/*
|--------------------------------------------------------------------------
| Export des middlewares et helpers
|--------------------------------------------------------------------------
*/

module.exports = {
    requireAuth,
    requireAdmin,
    requireManagerOrAdmin,
    requireRole,
    getSessionTeamIds,
    userHasTeam,
    userCanManageTeam
};