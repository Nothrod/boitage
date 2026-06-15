/*
|--------------------------------------------------------------------------
| Map Boitage - Liste et détail des campagnes
|--------------------------------------------------------------------------
|
| Fichier : routes/campaigns/list.js
|
| Rôle :
| - GET /api/campaigns
| - GET /api/campaigns/:id/progress
|
| Permet :
| - lister les campagnes actives accessibles à l'utilisateur
| - afficher le détail complet d'une campagne
| - retourner les secteurs
| - retourner les rues
| - retourner la progression
| - retourner can_manage pour afficher Modifier / Supprimer côté frontend
|
|--------------------------------------------------------------------------
*/

const express = require("express");

const db = require("../../db/db");

const {
    requireAuth,
    getSessionTeamIds
} = require("../../middleware/auth");

const {
    canAccessCampaign,
    canManageCampaign
} = require("./helpers");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| GET /api/campaigns
|--------------------------------------------------------------------------
|
| Liste les campagnes actives.
|
| Admin :
| - voit toutes les campagnes actives.
|
| Manager / User :
| - voit uniquement les campagnes liées à ses équipes.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    requireAuth,
    (req, res) => {
        try {
            const user =
                req.session.user;

            const teamIds =
                getSessionTeamIds(req);

            let campaigns = [];

            if (user.role === "admin") {
                campaigns =
                    db.prepare(`
                        SELECT
                            c.id,
                            c.name,
                            c.team_id,
                            c.created_at,
                            c.updated_at,

                            t.name AS team_name,
                            u.name AS created_by_name

                        FROM campaigns c

                        LEFT JOIN teams t
                            ON t.id = c.team_id

                        LEFT JOIN users u
                            ON u.id = c.created_by

                        WHERE c.archived = 0

                        ORDER BY c.created_at DESC
                    `).all();
            } else {
                if (teamIds.length === 0) {
                    return res.json({
                        success: true,
                        campaigns: []
                    });
                }

                const placeholders =
                    teamIds.map(() => "?").join(",");

                campaigns =
                    db.prepare(`
                        SELECT
                            c.id,
                            c.name,
                            c.team_id,
                            c.created_at,
                            c.updated_at,

                            t.name AS team_name,
                            u.name AS created_by_name

                        FROM campaigns c

                        LEFT JOIN teams t
                            ON t.id = c.team_id

                        LEFT JOIN users u
                            ON u.id = c.created_by

                        WHERE c.archived = 0
                        AND c.team_id IN (${placeholders})

                        ORDER BY c.created_at DESC
                    `).all(
                        ...teamIds
                    );
            }

            const result =
                campaigns.map(campaign => {
                    const total =
                        db.prepare(`
                            SELECT COUNT(*) AS total
                            FROM campaign_sectors
                            WHERE campaign_id = ?
                        `).get(
                            campaign.id
                        ).total;

                    const validated =
                        db.prepare(`
                            SELECT COUNT(*) AS total
                            FROM validations
                            WHERE campaign_id = ?
                        `).get(
                            campaign.id
                        ).total;

                    return {
                        ...campaign,

                        can_manage:
                            canManageCampaign(
                                req,
                                campaign
                            ),

                        total_sectors:
                            total,

                        validated_sectors:
                            validated,

                        progress:
                            total === 0
                                ? 0
                                : Math.round(
                                    (validated / total) * 100
                                )
                    };
                });

            return res.json({
                success: true,
                campaigns: result
            });

        } catch (error) {
            console.error(
                "Erreur GET /api/campaigns :",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Erreur lors du chargement des campagnes."
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| GET /api/campaigns/:id/progress
|--------------------------------------------------------------------------
|
| Retourne le détail complet d'une campagne :
| - infos campagne
| - progression globale
| - secteurs
| - rues
| - validations secteurs
| - validations rues
|
|--------------------------------------------------------------------------
*/

router.get(
    "/:id/progress",
    requireAuth,
    (req, res) => {
        try {
            const campaignId =
                Number(req.params.id);

            if (!campaignId) {
                return res.status(400).json({
                    success: false,
                    message: "Campagne invalide."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Chargement de la campagne
            |--------------------------------------------------------------------------
            */

            const campaign =
                db.prepare(`
                    SELECT
                        c.id,
                        c.name,
                        c.team_id,
                        c.created_at,
                        c.archived,
                        c.archived_at,

                        t.name AS team_name,
                        creator.name AS created_by_name,
                        completed.name AS completed_by_name

                    FROM campaigns c

                    LEFT JOIN teams t
                        ON t.id = c.team_id

                    LEFT JOIN users creator
                        ON creator.id = c.created_by

                    LEFT JOIN users completed
                        ON completed.id = c.completed_by

                    WHERE c.id = ?
                `).get(
                    campaignId
                );

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: "Campagne introuvable."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Vérification accès
            |--------------------------------------------------------------------------
            */

            if (
                !canAccessCampaign(
                    req,
                    campaign
                )
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Vous n'avez pas accès à cette campagne."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Chargement des secteurs de la campagne
            |--------------------------------------------------------------------------
            */

            const sectors =
                db.prepare(`
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

                    ORDER BY s.name ASC
                `).all(
                    campaignId
                );

            /*
            |--------------------------------------------------------------------------
            | Chargement des rues des secteurs de la campagne
            |--------------------------------------------------------------------------
            */

            const streets =
                db.prepare(`
                    SELECT
                        st.id,
                        st.sector_id,
                        st.name,

                        sv.comment,
                        sv.validated_at,

                        u.name AS validated_by_name

                    FROM streets st

                    INNER JOIN campaign_sectors cs
                        ON cs.sector_id = st.sector_id

                    LEFT JOIN street_validations sv
                        ON sv.street_id = st.id
                        AND sv.campaign_id = cs.campaign_id

                    LEFT JOIN users u
                        ON u.id = sv.validated_by

                    WHERE cs.campaign_id = ?

                    ORDER BY st.name ASC
                `).all(
                    campaignId
                );

            /*
            |--------------------------------------------------------------------------
            | Association rues -> secteurs
            |--------------------------------------------------------------------------
            */

            const sectorsWithStreets =
                sectors.map(sector => {
                    const sectorStreets =
                        streets.filter(street => {
                            return Number(street.sector_id) === Number(sector.id);
                        });

                    const totalStreets =
                        sectorStreets.length;

                    const validatedStreets =
                        sectorStreets.filter(street => {
                            return street.validated_at;
                        }).length;

                    return {
                        ...sector,

                        streets:
                            sectorStreets,

                        total_streets:
                            totalStreets,

                        validated_streets:
                            validatedStreets,

                        streets_progress:
                            totalStreets === 0
                                ? 0
                                : Math.round(
                                    (validatedStreets / totalStreets) * 100
                                )
                    };
                });

            /*
            |--------------------------------------------------------------------------
            | Progression globale campagne
            |--------------------------------------------------------------------------
            */

            const total =
                sectorsWithStreets.length;

            const validated =
                sectorsWithStreets.filter(sector => {
                    return sector.validated_at;
                }).length;

            const progress =
                total === 0
                    ? 0
                    : Math.round(
                        (validated / total) * 100
                    );

            return res.json({
                success: true,

                campaign: {
                    ...campaign,

                    can_manage:
                        canManageCampaign(
                            req,
                            campaign
                        ),

                    total_sectors:
                        total,

                    validated_sectors:
                        validated,

                    progress,

                    sectors:
                        sectorsWithStreets
                }
            });

        } catch (error) {
            console.error(
                "Erreur GET /api/campaigns/:id/progress :",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Erreur lors du chargement de la progression."
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