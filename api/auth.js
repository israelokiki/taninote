// Accounts: sign up, sign in, sign out, change password, delete account.
// GET returns the signed-in user (or null). POST takes { action, ... }.
import { list, del } from '@vercel/blob';
import { randomBytes } from 'node:crypto';
import { mailReady, sendMail, resetEmail } from './_mail.js';
import {
  route, body, send, fail, q, clientIp, allow, resetLimit,
  hashPassword, checkPassword, DUMMY_HASH, sha, startSession, endSession, clearCookie, currentUser, requireUser,
} from './_lib.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const cleanEmail = (e) => String(e || '').trim().toLowerCase();
function badPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Use at least 8 characters for your password.';
  if (pw.length > 200) return 'That password is too long.';
  return '';
}

async function usage(userId) {
  const r = await q(`select coalesce(sum(size), 0)::bigint as bytes from files where user_id = $1`, [userId]);
  return +r[0].bytes;
}

async function deleteUserFiles(userId) {
  let cursor;
  do {
    const page = await list({ prefix: `u/${userId}/`, cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

export default route(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const u = await currentUser(req);
    return send(res, 200, { user: u ? { email: u.email, used: await usage(u.id) } : null });
  }

  const b = body(req);
  const ip = clientIp(req);

  if (b.action === 'signup') {
    const email = cleanEmail(b.email);
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'Enter a valid email address.');
    const bad = badPassword(b.password);
    if (bad) return fail(res, 400, bad);
    if (!await allow('signup:' + ip, 10, 3600)) return fail(res, 429, 'Too many new accounts from this network. Try again later.');
    const pw = await hashPassword(b.password);
    const rows = await q(`insert into users(email, pw) values($1, $2) on conflict (email) do nothing returning id, email`, [email, pw]);
    if (!rows.length) return fail(res, 409, 'An account with this email already exists. Sign in instead.');
    await startSession(res, rows[0].id);
    return send(res, 200, { user: { email, used: 0 } });
  }

  if (b.action === 'login') {
    const email = cleanEmail(b.email);
    if (!await allow('login-ip:' + ip, 40, 900) || !await allow('login:' + email, 10, 900)) {
      return fail(res, 429, 'Too many tries. Wait 15 minutes and try again.');
    }
    const rows = EMAIL_RE.test(email) ? await q(`select id, email, pw from users where email = $1`, [email]) : [];
    const ok = await checkPassword(String(b.password || ''), rows[0] ? rows[0].pw : DUMMY_HASH);
    if (!rows[0] || !ok) return fail(res, 401, 'That email and password don\'t match.');
    await resetLimit('login:' + email);
    await startSession(res, rows[0].id);
    return send(res, 200, { user: { email: rows[0].email, used: await usage(rows[0].id) } });
  }

  if (b.action === 'forgot') {
    const email = cleanEmail(b.email);
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'Enter a valid email address.');
    if (!mailReady()) return fail(res, 503, 'Password reset by email isn\'t switched on yet. Ask the TaniNote team for help.');
    if (!await allow('forgot-ip:' + ip, 10, 3600) || !await allow('forgot:' + email, 3, 3600)) {
      return fail(res, 429, 'Too many reset emails. Wait an hour and try again.');
    }
    const rows = await q(`select id from users where email = $1`, [email]);
    if (rows.length) {
      const token = randomBytes(32).toString('base64url');
      await q(`delete from resets where user_id = $1`, [rows[0].id]); // only the newest link works
      await q(`insert into resets(token_hash, user_id, expires) values($1, $2, now() + interval '30 minutes')`, [sha(token), rows[0].id]);
      const base = (process.env.APP_URL || 'https://taninote.vercel.app').replace(/\/+$/, '');
      try { await sendMail({ to: email, subject: 'Reset your TaniNote password', ...resetEmail(`${base}/#reset=${token}`) }); }
      catch (e) { console.error('mail', e && e.message); return fail(res, 502, 'The reset email couldn\'t be sent. Try again in a few minutes.'); }
    }
    // Same answer either way, so this can't be used to find out who has an account.
    return send(res, 200, { ok: true });
  }

  if (b.action === 'reset') {
    const token = String(b.token || '');
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return fail(res, 400, 'This reset link isn\'t valid. Ask for a new one.');
    if (!await allow('reset-ip:' + ip, 20, 3600)) return fail(res, 429, 'Too many tries. Wait an hour and try again.');
    const bad = badPassword(b.password);
    if (bad) return fail(res, 400, bad);
    const rows = await q(`update resets set used = true where token_hash = $1 and not used and expires > now() returning user_id`, [sha(token)]);
    if (!rows.length) return fail(res, 410, 'This reset link has expired or was already used. Ask for a new one.');
    const userId = rows[0].user_id;
    await q(`update users set pw = $1 where id = $2`, [await hashPassword(b.password), userId]);
    await q(`delete from sessions where user_id = $1`, [userId]); // sign out everywhere else
    await q(`delete from resets where user_id = $1`, [userId]);
    const [u] = await q(`select email from users where id = $1`, [userId]);
    await resetLimit('login:' + u.email);
    await startSession(res, userId);
    return send(res, 200, { user: { email: u.email, used: await usage(userId) } });
  }

  if (b.action === 'logout') {
    await endSession(req);
    clearCookie(res);
    return send(res, 200, { ok: true });
  }

  const u = await requireUser(req, res);
  if (!u) return;

  if (b.action === 'password' || b.action === 'delete') {
    if (!await allow('pw:' + u.id, 10, 900)) return fail(res, 429, 'Too many tries. Wait 15 minutes and try again.');
    const [row] = await q(`select pw from users where id = $1`, [u.id]);
    if (!await checkPassword(String(b.password || ''), row.pw)) return fail(res, 401, 'Your current password isn\'t right.');

    if (b.action === 'password') {
      const bad = badPassword(b.newPassword);
      if (bad) return fail(res, 400, bad);
      await q(`update users set pw = $1 where id = $2`, [await hashPassword(b.newPassword), u.id]);
      await q(`delete from sessions where user_id = $1`, [u.id]); // sign out every other device
      await startSession(res, u.id);
      return send(res, 200, { ok: true });
    }

    await deleteUserFiles(u.id);
    await q(`delete from users where id = $1`, [u.id]); // sessions, records and files cascade
    clearCookie(res);
    return send(res, 200, { ok: true });
  }

  return fail(res, 400, 'Unknown action');
});
