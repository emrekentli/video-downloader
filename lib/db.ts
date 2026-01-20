import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data.db');

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      links TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

export async function createCollection(id: string, links: string[]): Promise<void> {
  const database = await getDb();
  database.run('INSERT INTO collections (id, links) VALUES (?, ?)', [id, JSON.stringify(links)]);
  saveDb();
}

export async function getCollection(id: string): Promise<string[] | null> {
  const database = await getDb();
  const result = database.exec('SELECT links FROM collections WHERE id = ?', [id]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  return JSON.parse(result[0].values[0][0] as string);
}
