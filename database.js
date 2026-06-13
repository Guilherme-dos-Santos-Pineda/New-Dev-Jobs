import Database from 'better-sqlite3';

const db = new Database('jobs.db');

db.exec(`
CREATE TABLE IF NOT EXISTS Jobs (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Company TEXT,
    JobTitle TEXT,
    Email TEXT,
    Skills TEXT,
    Description TEXT,
    LinkedinId TEXT UNIQUE,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

export default db;