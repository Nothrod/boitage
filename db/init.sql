/*
|--------------------------------------------------------------------------
| Map Boitage - Initialisation base de données
|--------------------------------------------------------------------------
|
| Fichier : db/init.sql
|
| Rôle :
| Crée toutes les tables nécessaires à l'application.
|
| Important :
| CREATE TABLE IF NOT EXISTS ne modifie pas les anciennes tables.
| Les colonnes manquantes sur une base existante doivent être ajoutées
| par migration dans server.js.
|
|--------------------------------------------------------------------------
*/

PRAGMA foreign_keys = ON;

/*
|--------------------------------------------------------------------------
| Équipes
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL UNIQUE,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

/*
|--------------------------------------------------------------------------
| Utilisateurs
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS users (
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
);

/*
|--------------------------------------------------------------------------
| Liaison utilisateurs / équipes
|--------------------------------------------------------------------------
*/

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
);

/*
|--------------------------------------------------------------------------
| Tokens d'activation
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS activation_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,
    used_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

/*
|--------------------------------------------------------------------------
| Tokens de réinitialisation mot de passe
|--------------------------------------------------------------------------
*/

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
);

/*
|--------------------------------------------------------------------------
| Secteurs
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS sectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    team_id INTEGER,

    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#3388ff',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,

    FOREIGN KEY (team_id)
        REFERENCES teams(id)
        ON DELETE SET NULL
);

/*
|--------------------------------------------------------------------------
| Rues
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS streets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    sector_id INTEGER NOT NULL,
    name TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sector_id)
        REFERENCES sectors(id)
        ON DELETE CASCADE
);

/*
|--------------------------------------------------------------------------
| Campagnes
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS campaigns (
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
);

/*
|--------------------------------------------------------------------------
| Liaison campagnes / secteurs
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS campaign_sectors (
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
);

/*
|--------------------------------------------------------------------------
| Validations secteurs
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS validations (
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
);

/*
|--------------------------------------------------------------------------
| Validations rues
|--------------------------------------------------------------------------
*/

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
);

/*
|--------------------------------------------------------------------------
| Logs
|--------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS logs (
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
);

/*
|--------------------------------------------------------------------------
| Index
|--------------------------------------------------------------------------
*/

CREATE INDEX IF NOT EXISTS idx_teams_name
ON teams(name);

CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username);

CREATE INDEX IF NOT EXISTS idx_users_role
ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);

CREATE INDEX IF NOT EXISTS idx_user_teams_user_id
ON user_teams(user_id);

CREATE INDEX IF NOT EXISTS idx_user_teams_team_id
ON user_teams(team_id);

CREATE INDEX IF NOT EXISTS idx_activation_tokens_token
ON activation_tokens(token);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
ON password_reset_tokens(token);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
ON password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_sectors_team_id
ON sectors(team_id);

CREATE INDEX IF NOT EXISTS idx_streets_sector_id
ON streets(sector_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_team_id
ON campaigns(team_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_archived
ON campaigns(archived);

CREATE INDEX IF NOT EXISTS idx_campaign_sectors_campaign_id
ON campaign_sectors(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_sectors_sector_id
ON campaign_sectors(sector_id);

CREATE INDEX IF NOT EXISTS idx_validations_campaign_id
ON validations(campaign_id);

CREATE INDEX IF NOT EXISTS idx_validations_sector_id
ON validations(sector_id);

CREATE INDEX IF NOT EXISTS idx_street_validations_campaign_id
ON street_validations(campaign_id);

CREATE INDEX IF NOT EXISTS idx_street_validations_sector_id
ON street_validations(sector_id);

CREATE INDEX IF NOT EXISTS idx_street_validations_street_id
ON street_validations(street_id);

CREATE INDEX IF NOT EXISTS idx_logs_user_id
ON logs(user_id);

CREATE INDEX IF NOT EXISTS idx_logs_created_at
ON logs(created_at);