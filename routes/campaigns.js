/*
|--------------------------------------------------------------------------
| Map Boitage - Routes Campagnes
|--------------------------------------------------------------------------
|
| Fichier : routes/campaigns.js
|
| Rôle :
| Point d'entrée des routes campagnes.
|
|--------------------------------------------------------------------------
*/

const express = require("express");

const router = express.Router();

router.use("/", require("./campaigns/list"));
router.use("/", require("./campaigns/create"));
router.use("/", require("./campaigns/update"));
router.use("/", require("./campaigns/delete"));
router.use("/", require("./campaigns/validate-sector"));
router.use("/", require("./campaigns/validate-street"));
router.use("/", require("./campaigns/sectors"));

module.exports = router;