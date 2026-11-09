import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AdapterPayload } from 'oidc-provider';

export interface Identity { userId: number; organizationId: number; version: number; displayName: string }
export interface Ticket {
  scene: string; uid: string; csrf: string; clientId: string; clientName: string;
  redirectUri: string; scopes: string[]; expires: number;
  decision?: 'allow' | 'deny'; identity?: Identity;
}
export const accountId = (identity: Identity) => `${identity.userId}:${identity.organizationId}:${identity.version}`;
export function parseAccount(value: string): Identity {
  if (!/^\d+:\d+:\d+$/.test(value)) throw new Error('Invalid account identity');
  const [userId, organizationId, version] = value.split(':').map(Number);
  if (![userId, version].every(n => Number.isSafeInteger(n) && n > 0) || !Number.isSafeInteger(organizationId) || organizationId < 0) throw new Error('Invalid account identity');
  return { userId, organizationId, version, displayName: '' };
}

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS oauth_objects (
        model TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER,
        grant_id TEXT, uid TEXT, user_code TEXT, PRIMARY KEY(model,id));
      CREATE INDEX IF NOT EXISTS oauth_grant ON oauth_objects(grant_id);
      CREATE INDEX IF NOT EXISTS oauth_uid ON oauth_objects(model,uid);
      CREATE TABLE IF NOT EXISTS tickets (scene TEXT PRIMARY KEY, uid TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS grant_history (id TEXT PRIMARY KEY, account TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  setting(name: string): string | undefined {
    return (this.db.prepare('SELECT value FROM settings WHERE id=?').get(name) as { value: string } | undefined)?.value;
  }
  saveSetting(name: string, value: string) {
    this.db.prepare('INSERT OR IGNORE INTO settings(id,value) VALUES(?,?)').run(name, value);
  }
  adapter = (model: string) => {
    const db = this.db;
    const find = (field: 'id' | 'uid' | 'user_code', value: string) => {
      const row = db.prepare(`SELECT payload FROM oauth_objects WHERE model=? AND ${field}=? AND (expires IS NULL OR expires>?)`).get(model, value, Math.floor(Date.now() / 1000)) as { payload: string } | undefined;
      return row ? JSON.parse(row.payload) as AdapterPayload : undefined;
    };
    return {
      async upsert(id: string, payload: AdapterPayload, expiresIn: number) {
        db.prepare(`INSERT INTO oauth_objects(model,id,payload,expires,grant_id,uid,user_code) VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(model,id) DO UPDATE SET payload=excluded.payload,expires=excluded.expires,
          grant_id=excluded.grant_id,uid=excluded.uid,user_code=excluded.user_code`).run(
          model, id, JSON.stringify(payload), expiresIn ? Math.floor(Date.now()/1000)+expiresIn : null,
          payload.grantId || null, payload.uid || null, payload.userCode || null);
      },
      async find(id: string) { return find('id', id); },
      async findByUid(uid: string) { return find('uid', uid); },
      async findByUserCode(code: string) { return find('user_code', code); },
      async consume(id: string) {
        db.prepare("UPDATE oauth_objects SET payload=json_set(payload,'$.consumed',?) WHERE model=? AND id=?").run(Math.floor(Date.now()/1000), model, id);
      },
      async destroy(id: string) { db.prepare('DELETE FROM oauth_objects WHERE model=? AND id=?').run(model, id); },
      async revokeByGrantId(id: string) { db.prepare('DELETE FROM oauth_objects WHERE grant_id=?').run(id); },
    };
  };
  ticket(uid: string, details?: Omit<Ticket, 'uid' | 'scene' | 'csrf' | 'expires'>): Ticket | undefined {
    const row = this.db.prepare('SELECT payload FROM tickets WHERE uid=? AND expires>?').get(uid, Date.now()) as { payload: string } | undefined;
    if (row) return JSON.parse(row.payload);
    if (!details) return undefined;
    const ticket: Ticket = { ...details, uid, scene: randomBytes(16).toString('hex'), csrf: randomBytes(24).toString('base64url'), expires: Date.now()+600_000 };
    this.db.prepare('INSERT OR REPLACE INTO tickets(scene,uid,payload,expires) VALUES(?,?,?,?)').run(ticket.scene, uid, JSON.stringify(ticket), ticket.expires);
    return ticket;
  }
  byScene(scene: string): Ticket | undefined {
    const row = this.db.prepare('SELECT payload FROM tickets WHERE scene=? AND expires>?').get(scene, Date.now()) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) : undefined;
  }
  decide(scene: string, decision: 'allow' | 'deny', identity: Identity): boolean {
    return this.db.prepare(`UPDATE tickets SET payload=json_set(payload,'$.decision',?,'$.identity',json(?))
      WHERE scene=? AND expires>? AND json_extract(payload,'$.decision') IS NULL`).run(decision, JSON.stringify(identity), scene, Date.now()).changes === 1;
  }
  deleteTicket(uid: string) { this.db.prepare('DELETE FROM tickets WHERE uid=?').run(uid); }
  rememberGrant(id: string, ticket: Ticket) {
    this.db.prepare('INSERT INTO grant_history(id,account,payload) VALUES(?,?,?)').run(id, accountId(ticket.identity!), JSON.stringify({
      id, clientName: ticket.clientName, redirectOrigin: new URL(ticket.redirectUri).origin, scopes: ticket.scopes, createdAt: new Date().toISOString(),
    }));
  }
  grants(userId: number) {
    return this.db.prepare(`SELECT h.payload FROM grant_history h JOIN oauth_objects o ON o.id=h.id AND o.model='Grant'
      WHERE h.account LIKE ? AND (o.expires IS NULL OR o.expires>?)`).all(`${userId}:%`, Math.floor(Date.now()/1000)).map(row => JSON.parse(String(row.payload)));
  }
  cleanup() {
    this.db.prepare('DELETE FROM oauth_objects WHERE expires<=?').run(Math.floor(Date.now()/1000));
    this.db.prepare('DELETE FROM tickets WHERE expires<=?').run(Date.now());
    this.db.exec("DELETE FROM grant_history WHERE id NOT IN (SELECT id FROM oauth_objects WHERE model='Grant')");
  }
}
