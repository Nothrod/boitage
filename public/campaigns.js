/*
|--------------------------------------------------------------------------
| Map Boitage - Campagnes / Initialisation
|--------------------------------------------------------------------------
|
| Fichier : public/campaigns.js
|
| Rôle :
| Point d'entrée du module campagnes.
|
| Les fonctionnalités sont réparties dans :
|
| - campaigns-list.js
| - campaigns-render.js
| - campaigns-validation.jsaaaaaa
| - campaigns-modal.js
|
| Ce fichier ne fait que :
| - exposer l'ID de campagne courante
| - lancer le chargement initial
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Campagne actuellement ouverte
|--------------------------------------------------------------------------
|
| Utilisé par :
| - campaigns-list.js
| - campaigns-validation.js
|
|--------------------------------------------------------------------------
*/

window.currentCampaignId = null;

/*
|--------------------------------------------------------------------------
| Initialisation
|--------------------------------------------------------------------------
*/

document.addEventListener(
    "DOMContentLoaded",
    () => {

        /*
        |--------------------------------------------------------------------------
        | Chargement initial des campagnes
        |--------------------------------------------------------------------------
        */

        if (
            typeof loadCampaigns === "function"
        ) {
            loadCampaigns();
        }

    }
);