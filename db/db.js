/*
|--------------------------------------------------------------------------
| Map Boitage - Connexion base de données
|--------------------------------------------------------------------------
|
| Fichier : db/db.js
|
| Rôle :
| Initialise et exporte la connexion SQLite utilisée par
| toute l'application.
|
| Important :
| Ce fichier doit être le SEUL point d'entrée vers la base SQLite.
|
| Dans les routes :
| const db = require("../db/db");
|
| Dans server.js :
| const db = require("./db/db");
|
|--------------------------------------------------------------------------
*/

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

/*
|--------------------------------------------------------------------------
| Chemin absolu de la base SQLite
|--------------------------------------------------------------------------
|
| La base est stockée ici :
| /db/database.db
|
|--------------------------------------------------------------------------
*/

const dbPath = path.join(__dirname, "database.db");

/*
|--------------------------------------------------------------------------
| Vérification du dossier db
|--------------------------------------------------------------------------
*/

if (!fs.existsSync(__dirname)) {
    fs.mkdirSync(__dirname, { recursive: true });
}

/*
|--------------------------------------------------------------------------
| Connexion SQLite
|--------------------------------------------------------------------------
*/

const db = new Database(dbPath);

/*
|--------------------------------------------------------------------------
| Configuration SQLite
|--------------------------------------------------------------------------
*/

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

/*
|--------------------------------------------------------------------------
| Vérification connexion + diagnostic
|--------------------------------------------------------------------------
*/

try {
    db.prepare("SELECT 1").get();

    console.log("✓ Base de données SQLite connectée");
    console.log(`✓ Fichier SQLite utilisé : ${dbPath}`);

    /*
    |--------------------------------------------------------------------------
    | Diagnostic table users
    |--------------------------------------------------------------------------
    */

    const usersTable = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        AND name = 'users'
    `).get();

    if (!usersTable) {
        console.log("ℹ Table users absente pour le moment.");
    } else {
        const userCount = db.prepare(`
            SELECT COUNT(*) AS total
            FROM users
        `).get();

        console.log(`✓ Utilisateurs en base : ${userCount.total}`);

        const users = db.prepare(`
            SELECT id, name, username, role, is_active
            FROM users
            ORDER BY id ASC
        `).all();

        console.log("✓ Liste utilisateurs en base :");
        console.table(users);
    }

} catch (error) {
    console.error("✗ Erreur connexion SQLite");
    console.error(error.message);
    process.exit(1);
}

/*
|--------------------------------------------------------------------------
| Export connexion
|--------------------------------------------------------------------------
*/

module.exports = db;