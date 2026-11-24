// Shared helpers for TaniNote's server functions: database, sessions, request checks, rate limits.
// Files starting with "_" are not exposed as routes by Vercel.
import { neon } from '@neondatabase/serverless';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

export const sql = neon(process.env.DATABASE_URL);
const q = (text, params = []) => sql.query(text, params);
export { q };

// ---------- Schema (created on first use; every statement is idempotent) ----------
let schemaReady;
export function ensureSchema() {
  return schemaReady || (schemaReady = (async () => {
    const stmts = [
      `create table if not exists users (
         id uuid primary key default gen_random_uuid(),
         email text unique not null,
         pw text not null,
         created timestamptz not null default now())`,
      `create table if not exists sessions (
         token_hash text primary key,
         user_id uuid not null references users(id) on delete cascade,
         expires timestamptz not null,
         created timestamptz not null default now())`,
      `create index if not exists sessions_user on sessions(user_id)`,
      `create sequence if not exists rev_seq`,
      `create table if not exists records (
         user_id uuid not null references users(id) on delete cascade,
         store text not null,
         id text not null,
         data jsonb,
         m bigint not null,
         deleted boolean not null default false,
         size integer not null default 0,
         rev bigint not null default nextval('rev_seq'),
         primary key (user_id, store, id))`,
      `create index if not exists records_rev on records(user_id, rev)`,
      `create table if not exists files (
         user_id uuid not null references users(id) on delete cascade,
         path text not null,
         size bigint not null,
         primary key (user_id, path))`,
      `create table if not exists resets (
         token_hash text primary key,
         user_id uuid not null references users(id) on delete cascade,
         expires timestamptz not null,
         used boolean not null default false)`,
      `create table if not exists attempts (
         k text primary key,
         n integer not null,
         since timestamptz not null)`,
    ];
    for (const s of stmts) await q(s);
  })().catch((e) => { schemaReady = null; throw e; }));
}

// ---------- Responses ----------
export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
export const fail = (res, status, error) => send(res, status, { error });

// Wraps a handler: schema, method/CSRF checks and a safe error message.
export function route(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) return fail(res, 405, 'Method not allowed');
      if (req.method !== 'GET') {
        // A custom header can't be sent cross-site without a CORS preflight, which we never allow.
        if (req.headers['x-taninote'] !== '1') return fail(res, 403, 'Forbidden');
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return fail(res, 403, 'Forbidden');
      }
      await ensureSchema();
      await fn(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) fail(res, 500, 'Something went wrong on the server. Try again in a moment.');
    }
  };
}

export function body(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  try { return JSON.parse(b || '{}'); } catch { return {}; }
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown';
}

// ---------- Passwords ----------
const scrypt = (pw, salt, n) => new Promise((ok, no) => scryptCb(pw, salt, 32, { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? no(e) : ok(k)));
const N = 32768;
export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, N);
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function checkPassword(pw, stored) {
  const [alg, n, salt, key] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), +n);
  return want.length === got.length && timingSafeEqual(want, got);
}
// Used when the email is unknown, so a failed login takes as long either way.
export const DUMMY_HASH = 'scrypt$32768$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

// ---------- Sessions ----------
const COOKIE = '__Host-tn';
const SESSION_DAYS = 60;
export const sha = (s) => createHash('sha256').update(s).digest('base64url');

export async function startSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  await q(`insert into sessions(token_hash, user_id, expires) values($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha(token), userId]);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}
export function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
function cookieToken(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)__Host-tn=([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : null;
}
export async function currentUser(req) {
  const t = cookieToken(req);
  if (!t) return null;
  const rows = await q(`select u.id, u.email from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires > now()`, [sha(t)]);
  return rows[0] || null;
}
export async function endSession(req) {
  const t = cookieToken(req);
  if (t) await q(`delete from sessions where token_hash = $1`, [sha(t)]);
}
export async function requireUser(req, res) {
  const u = await currentUser(req);
  if (!u) fail(res, 401, 'Please sign in again.');
  return u;
}

// ---------- Rate limits ----------
// Returns true while the key is under `max` hits in the last `windowSec` seconds.
export async function allow(key, max, windowSec) {
  const rows = await q(
    `insert into attempts(k, n, since) values($1, 1, now())
     on conflict (k) do update set
       n = case when attempts.since < now() - make_interval(secs => $2) then 1 else attempts.n + 1 end,
       since = case when attempts.since < now() - make_interval(secs => $2) then now() else attempts.since end
     returning n`, [key, windowSec]);
  return rows[0].n <= max;
}
export const resetLimit = (key) => q(`delete from attempts where k = $1`, [key]);

// ---------- Validation ----------
export const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
export const STORES = new Set(['docs', 'ink', 'plan', 'sounds']);
export const QUOTA = (+process.env.TN_QUOTA_MB || 500) * 1024 * 1024;
