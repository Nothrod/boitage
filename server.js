/*
|--------------------------------------------------------------------------
| Map Boitage - Serveur principal
|--------------------------------------------------------------------------
|
| Fichier : server.js
|
| Rôle :
| - démarrer le serveur Express
| - charger les variables d'environnement
| - initialiser la base SQLite
| - appliquer les migrations SQLite nécessaires
| - réparer les anciennes clés étrangères cassées
| - créer automatiquement le premier compte administrateur
| - configurer les sessions utilisateurs
| - servir les fichiers publics
| - charger les routes API
|
|--------------------------------------------------------------------------
*/

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const db = require("./db/db");

/*
|--------------------------------------------------------------------------
| Chargement des routes
|--------------------------------------------------------------------------
*/

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const sectorsRoutes = require("./routes/sectors");
const campaignsRoutes = require("./routes/campaigns");
const archivesRoutes = require("./routes/archives");
const registrationsRoutes = require("./routes/registrations");

/*
|--------------------------------------------------------------------------
| Route équipes optionnelle
|--------------------------------------------------------------------------
|
| Si routes/teams.js existe, elle sera chargée.
| Sinon l'application continue sans planter.
|
|--------------------------------------------------------------------------
*/

let teamsRoutes = null;

try {
    teamsRoutes = require("./routes/teams");
} catch {
    teamsRoutes = null;
}

/*
|--------------------------------------------------------------------------
| Création application
|--------------------------------------------------------------------------
*/

const app = express();

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-moi";
const SESSION_DURATION_HOURS = Number(process.env.SESSION_DURATION_HOURS || 8);

/*
|--------------------------------------------------------------------------
| Proxy HTTPS
|--------------------------------------------------------------------------
*/

app.set("trust proxy", 1);

/*
|--------------------------------------------------------------------------
| Middlewares de base
|--------------------------------------------------------------------------
*/

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
|--------------------------------------------------------------------------
| Sessions
|--------------------------------------------------------------------------
*/

app.use(
    session({
        store: new SQLiteStore({
            db: "sessions.sqlite",
            dir: path.join(__dirname, "db")
        }),

        name: "map_boitage_session",

        secret: SESSION_SECRET,

        resave: false,
        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            secure: "auto",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * SESSION_DURATION_HOURS
        }
    })
);

/*
|--------------------------------------------------------------------------
| Fonctions utilitaires SQLite
|--------------------------------------------------------------------------
*/

function tableExists(tableName) {
    const table = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        AND name = ?
    `).get(tableName);

    return Boolean(table);
}

function columnExists(tableName, columnName) {
    if (!tableExists(tableName)) {
        return false;
    }

    const columns = db.prepare(`
        PRAGMA table_info(${tableName})
    `).all();

    return columns.some(column => column.name === columnName);
}

function addColumnIfMissing(tableName, columnDefinition) {
    const columnName = columnDefinition.split(" ")[0];

    if (!tableExists(tableName)) {
        console.log(`ℹ Table ${tableName} absente, colonne ${columnName} ignorée`);
        return;
    }

    if (!columnExists(tableName, columnName)) {
        db.prepare(`
            ALTER TABLE ${tableName}
            ADD COLUMN ${columnDefinition}
        `).run();

        console.log(`✓ Colonne ${columnName} ajoutée à ${tableName}`);
        return;
    }

    console.log(`✓ Colonne ${columnName} déjà présente dans ${tableName}`);
}

/*
|--------------------------------------------------------------------------
| Initialisation base SQLite sécurisée
|--------------------------------------------------------------------------
|
| Important :
| db/init.sql contient parfois des index sur team_id.
|
| Sur une ancienne base, la colonne team_id peut ne pas encore exister.
| Si on exécute db.exec(initSql) directement, SQLite plante avant les
| migrations.
|
| Solution :
| - on exécute chaque instruction SQL séparément
| - si un index plante à cause d'une colonne absente, on l'ignore
| - les migrations ajoutent ensuite les colonnes
| - les index sont recréés après les migrations
|
|--------------------------------------------------------------------------
*/

function executeInitSqlSafely() {
    const initSqlPath = path.join(__dirname, "db", "init.sql");
    const initSql = fs.readFileSync(initSqlPath, "utf8");

    const statements = initSql
        .split(";")
        .map(statement => statement.trim())
        .filter(Boolean);

    statements.forEach(statement => {
        try {
            db.prepare(statement).run();
        } catch (error) {
            const message = String(error.message || "");

            const isMissingColumnOnIndex =
                statement.toUpperCase().startsWith("CREATE INDEX") &&
                message.includes("no such column");

            if (isMissingColumnOnIndex) {
                console.log(
                    `ℹ Index ignoré temporairement : ${message}`
                );

                return;
            }

            throw error;
        }
    });
}

/*
|--------------------------------------------------------------------------
| Initialisation base SQLite
|--------------------------------------------------------------------------
*/

try {
    executeInitSqlSafely();

    console.log("✓ Base de données initialisée");
} catch (error) {
    console.error("✗ Erreur initialisation base");
    console.error(error.message);
    process.exit(1);
}

/*
|--------------------------------------------------------------------------
| Vérifier si users accepte le rôle manager
|--------------------------------------------------------------------------
*/

function usersTableAllowsManager() {
    if (!tableExists("users")) {
        return false;
    }

    const table = db.prepare(`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table'
        AND name = 'users'
    `).get();

    if (!table || !table.sql) {
        return false;
    }

    return table.sql.includes("'manager'");
}

/*
|--------------------------------------------------------------------------
| Migration users pour accepter le rôle manager
|--------------------------------------------------------------------------
|
| SQLite ne permet pas de modifier directement un CHECK.
| Si l'ancienne table users n'accepte que user/admin, on la reconstruit.
|
|--------------------------------------------------------------------------
*/

function migrateUsersRoleManagerIfNeeded() {
    if (!tableExists("users")) {
        return;
    }

    if (usersTableAllowsManager()) {
        console.log("✓ Table users compatible avec le rôle manager");
        return;
    }

    console.log("ℹ Migration users : ajout compatibilité rôle manager");

    db.pragma("foreign_keys = OFF");

    const transaction = db.transaction(() => {
        db.prepare(`
            ALTER TABLE users
            RENAME TO users_old
        `).run();

        db.prepare(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                name TEXT NOT NULL,
                username TEXT NOT NULL UNIQUE,
                email TEXT,

                password_hash TEXT,

                role TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'manager', 'admin')),

                is_active INTEGER NOT NULL DEFAULT 0,

                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )
        `).run();

        const oldColumns = db.prepare(`
            PRAGMA table_info(users_old)
        `).all();

        const hasEmail =
            oldColumns.some(column => column.name === "email");

        if (hasEmail) {
            db.prepare(`
                INSERT INTO users (
                    id,
                    name,
                    username,
                    email,
                    password_hash,
                    role,
                    is_active,
                    created_at,
                    updated_at
                )
                SELECT
                    id,
                    name,
                    username,
                    email,
                    password_hash,
                    role,
                    is_active,
                    created_at,
                    updated_at
                FROM users_old
            `).run();
        } else {
            db.prepare(`
                INSERT INTO users (
                    id,
                    name,
                    username,
                    email,
                    password_hash,
                    role,
                    is_active,
                    created_at,
                    updated_at
                )
                SELECT
                    id,
                    name,
                    username,
                    '',
                    password_hash,
                    role,
                    is_active,
                    created_at,
                    updated_at
                FROM users_old
            `).run();
        }

        db.prepare(`
            DROP TABLE users_old
        `).run();

        db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_users_username
            ON users(username)
        `).run();

        db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_users_role
            ON users(role)
        `).run();
    });

    transaction();

    db.pragma("foreign_keys = ON");

    console.log("✓ Migration users terminée");
}

/*
|--------------------------------------------------------------------------
| Détection ancienne référence cassée
|--------------------------------------------------------------------------
*/

function tableReferencesOldTable(tableName) {
    if (!tableExists(tableName)) {
        return false;
    }

    const foreignKeys = db.prepare(`
        PRAGMA foreign_key_list(${tableName})
    `).all();

    return foreignKeys.some(foreignKey => {
        return (
            foreignKey.table === "users_old" ||
            foreignKey.table === "campaigns_old_repair" ||
            foreignKey.table.endsWith("_old_repair") ||
            foreignKey.table.endsWith("_tmp_repair")
        );
    });
}

/*
|--------------------------------------------------------------------------
| Réparation d'une table avec ancienne clé étrangère
|--------------------------------------------------------------------------
*/

function repairTableIfOldReference(tableName, createSql, columns) {
    if (!tableExists(tableName)) {
        return;
    }

    if (!tableReferencesOldTable(tableName)) {
        return;
    }

    console.log(`ℹ Réparation ${tableName} : ancienne référence détectée`);

    const temporaryTableName =
        `${tableName}_tmp_repair`;

    const existingColumns = db.prepare(`
        PRAGMA table_info(${tableName})
    `).all();

    const existingColumnNames =
        existingColumns.map(column => column.name);

    const columnsToCopy =
        columns.filter(column => existingColumnNames.includes(column));

    const columnList =
        columnsToCopy.join(", ");

    db.prepare(`
        ALTER TABLE ${tableName}
        RENAME TO ${temporaryTableName}
    `).run();

    db.prepare(createSql).run();

    if (columnsToCopy.length > 0) {
        db.prepare(`
            INSERT INTO ${tableName} (${columnList})
            SELECT ${columnList}
            FROM ${temporaryTableName}
        `).run();
    }

    db.prepare(`
        DROP TABLE ${temporaryTableName}
    `).run();

    console.log(`✓ Table ${tableName} réparée`);
}

/*
|--------------------------------------------------------------------------
| Réparation globale des clés étrangères cassées
|--------------------------------------------------------------------------
*/

function repairBrokenForeignKeys() {
    db.pragma("foreign_keys = OFF");

    repairTableIfOldReference(
        "campaigns",
        `
        CREATE TABLE campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            team_id INTEGER,

            archived INTEGER NOT NULL DEFAULT 0,
            archived_at TEXT,

            created_by INTEGER,
            completed_by INTEGER,

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT,

            FOREIGN KEY (team_id)
                REFERENCES teams(id)
                ON DELETE SET NULL,

            FOREIGN KEY (created_by)
                REFERENCES users(id)
                ON DELETE SET NULL,

            FOREIGN KEY (completed_by)
                REFERENCES users(id)
                ON DELETE SET NULL
        )
        `,
        [
            "id",
            "name",
            "team_id",
            "archived",
            "archived_at",
            "created_by",
            "completed_by",
            "created_at",
            "updated_at"
        ]
    );

    repairTableIfOldReference(
        "campaign_sectors",
        `
        CREATE TABLE campaign_sectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            campaign_id INTEGER NOT NULL,
            sector_id INTEGER NOT NULL,

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            UNIQUE (campaign_id, sector_id),

            FOREIGN KEY (campaign_id)
                REFERENCES campaigns(id)
                ON DELETE CASCADE,

            FOREIGN KEY (sector_id)
                REFERENCES sectors(id)
                ON DELETE CASCADE
        )
        `,
        [
            "id",
            "campaign_id",
            "sector_id",
            "created_at"
        ]
    );

    repairTableIfOldReference(
        "validations",
        `
        CREATE TABLE validations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            campaign_id INTEGER NOT NULL,
            sector_id INTEGER NOT NULL,

            validated_by INTEGER,

            comment TEXT,
            validated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            UNIQUE (campaign_id, sector_id),

            FOREIGN KEY (campaign_id)
                REFERENCES campaigns(id)
                ON DELETE CASCADE,

            FOREIGN KEY (sector_id)
                REFERENCES sectors(id)
                ON DELETE CASCADE,

            FOREIGN KEY (validated_by)
                REFERENCES users(id)
                ON DELETE SET NULL
        )
        `,
        [
            "id",
            "campaign_id",
            "sector_id",
            "validated_by",
            "comment",
            "validated_at"
        ]
    );

    repairTableIfOldReference(
        "street_validations",
        `
        CREATE TABLE street_validations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            campaign_id INTEGER NOT NULL,
            sector_id INTEGER NOT NULL,
            street_id INTEGER NOT NULL,

            validated_by INTEGER,

            comment TEXT,
            validated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            UNIQUE (campaign_id, street_id),

            FOREIGN KEY (campaign_id)
                REFERENCES campaigns(id)
                ON DELETE CASCADE,

            FOREIGN KEY (sector_id)
                REFERENCES sectors(id)
                ON DELETE CASCADE,

            FOREIGN KEY (street_id)
                REFERENCES streets(id)
                ON DELETE CASCADE,

            FOREIGN KEY (validated_by)
                REFERENCES users(id)
                ON DELETE SET NULL
        )
        `,
        [
            "id",
            "campaign_id",
            "sector_id",
            "street_id",
            "validated_by",
            "comment",
            "validated_at"
        ]
    );

    repairTableIfOldReference(
        "logs",
        `
        CREATE TABLE logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER,

            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id INTEGER,

            details TEXT,

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE SET NULL
        )
        `,
        [
            "id",
            "user_id",
            "action",
            "entity_type",
            "entity_id",
            "details",
            "created_at"
        ]
    );

    db.pragma("foreign_keys = ON");

    console.log("✓ Vérification / réparation clés étrangères terminée");
}

/*
|--------------------------------------------------------------------------
| Migrations automatiques SQLite
|--------------------------------------------------------------------------
*/

try {
    migrateUsersRoleManagerIfNeeded();

    /*
    |--------------------------------------------------------------------------
    | Tables équipes
    |--------------------------------------------------------------------------
    */

    db.prepare(`
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL UNIQUE,

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            UNIQUE (user_id, team_id),

            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE,

            FOREIGN KEY (team_id)
                REFERENCES teams(id)
                ON DELETE CASCADE
        )
    `).run();
	
	db.prepare(`
    CREATE TABLE IF NOT EXISTS registration_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT NOT NULL,
        email TEXT NOT NULL,
        team_ids TEXT NOT NULL DEFAULT '[]',
        token TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'approved', 'rejected')),
        user_id INTEGER,
        processed_by INTEGER,
        processed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
    )
`).run();

db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_registration_requests_status
    ON registration_requests(status)
`).run();

db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_registration_requests_username
    ON registration_requests(username)
`).run();

db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_registration_requests_created_at
    ON registration_requests(created_at)
`).run();	

    /*
    |--------------------------------------------------------------------------
    | Colonnes nécessaires sur anciennes bases
    |--------------------------------------------------------------------------
    */

    addColumnIfMissing("users", "email TEXT");
    addColumnIfMissing("campaigns", "team_id INTEGER");
    addColumnIfMissing("sectors", "team_id INTEGER");

    /*
    |--------------------------------------------------------------------------
    | Tables supplémentaires
    |--------------------------------------------------------------------------
    */

    db.prepare(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,

            expires_at TEXT NOT NULL,
            used_at TEXT,

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS street_validations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            campaign_id INTEGER NOT NULL,
            sector_id INTEGER NOT NULL,
            street_id INTEGER NOT NULL,

            validated_by INTEGER,

            comment TEXT,
            validated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            UNIQUE (campaign_id, street_id),

            FOREIGN KEY (campaign_id)
                REFERENCES campaigns(id)
                ON DELETE CASCADE,

            FOREIGN KEY (sector_id)
                REFERENCES sectors(id)
                ON DELETE CASCADE,

            FOREIGN KEY (street_id)
                REFERENCES streets(id)
                ON DELETE CASCADE,

            FOREIGN KEY (validated_by)
                REFERENCES users(id)
                ON DELETE SET NULL
        )
    `).run();

    /*
    |--------------------------------------------------------------------------
    | Réparation anciennes clés étrangères cassées
    |--------------------------------------------------------------------------
    */

    repairBrokenForeignKeys();

    /*
    |--------------------------------------------------------------------------
    | Index
    |--------------------------------------------------------------------------
    */

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_teams_name
        ON teams(name)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_users_username
        ON users(username)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_users_role
        ON users(role)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_users_email
        ON users(email)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_user_teams_user_id
        ON user_teams(user_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_user_teams_team_id
        ON user_teams(team_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_sectors_team_id
        ON sectors(team_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_streets_sector_id
        ON streets(sector_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_campaigns_team_id
        ON campaigns(team_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_campaigns_archived
        ON campaigns(archived)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_campaign_sectors_campaign_id
        ON campaign_sectors(campaign_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_campaign_sectors_sector_id
        ON campaign_sectors(sector_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_validations_campaign_id
        ON validations(campaign_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_validations_sector_id
        ON validations(sector_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
        ON password_reset_tokens(token)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
        ON password_reset_tokens(user_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_street_validations_campaign_id
        ON street_validations(campaign_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_street_validations_sector_id
        ON street_validations(sector_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_street_validations_street_id
        ON street_validations(street_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_logs_user_id
        ON logs(user_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_logs_created_at
        ON logs(created_at)
    `).run();

    console.log("✓ Migrations SQLite terminées");

} catch (error) {
    console.error("✗ Erreur migrations SQLite");
    console.error(error.message);
    process.exit(1);
}

/*
|--------------------------------------------------------------------------
| Création admin par défaut
|--------------------------------------------------------------------------
*/

try {
    const adminCount = db.prepare(`
        SELECT COUNT(*) AS total
        FROM users
        WHERE role = 'admin'
    `).get().total;

    if (adminCount === 0) {
        const passwordHash = bcrypt.hashSync("admin123", 10);

        db.prepare(`
            INSERT INTO users (
                name,
                username,
                email,
                password_hash,
                role,
                is_active,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        `).run(
            "Administrateur",
            "admin",
            "",
            passwordHash,
            "admin"
        );

        console.log("✓ Premier compte administrateur créé");
        console.log("Identifiant : admin");
        console.log("Mot de passe : admin123");
    }
} catch (error) {
    console.error("✗ Erreur création admin par défaut");
    console.error(error.message);
    process.exit(1);
}

/*
|--------------------------------------------------------------------------
| Cache désactivé pour les routes API
|--------------------------------------------------------------------------
*/

app.use("/api", (req, res, next) => {
    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    next();
});

/*
|--------------------------------------------------------------------------
| Routes API
|--------------------------------------------------------------------------
*/

app.use("/api", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/sectors", sectorsRoutes);

if (teamsRoutes) {
    app.use("/api/teams", teamsRoutes);
}

app.use("/api/campaigns", campaignsRoutes);
app.use("/api/archives", archivesRoutes);
app.use("/api", registrationsRoutes);

/*
|--------------------------------------------------------------------------
| Route 404 API
|--------------------------------------------------------------------------
*/

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route API introuvable : ${req.method} ${req.originalUrl}`
    });
});

/*
|--------------------------------------------------------------------------
| Fichiers publics
|--------------------------------------------------------------------------
*/

app.use(express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false,
    maxAge: 0,

    setHeaders: (res) => {
        res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, proxy-revalidate"
        );

        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
    }
}));

/*
|--------------------------------------------------------------------------
| Routes HTML principales
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/backend", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "backend.html"));
});

app.get("/backend.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "backend.html"));
});

app.get("/activate", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "activate.html"));
});

app.get("/activate.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "activate.html"));
});

app.get("/reset", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "reset.html"));
});

app.get("/reset.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "reset.html"));
});

/*
|--------------------------------------------------------------------------
| Route 404 HTML
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
    res.redirect("/");
});

/*
|--------------------------------------------------------------------------
| Démarrage
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
    console.log("--------------------------------------------------");
    console.log("Map Boitage démarré");
    console.log(`Mode : ${NODE_ENV}`);
    console.log(`Port : ${PORT}`);
    console.log(`URL locale : http://localhost:${PORT}`);
    console.log("--------------------------------------------------");
});