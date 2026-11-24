// Short-lived signed links so the browser can upload or download one of its own files directly
// to/from private Vercel Blob storage. The server never streams file bytes itself.
// POST { op: 'put' | 'get', kind: 'doc' | 'sound' | 'rec', id, size? }
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { route, body, send, fail, q, requireUser, allow, ID_RE, QUOTA } from './_lib.js';

const MAX = { doc: 300 * 1024 * 1024, sound: 50 * 1024 * 1024, rec: 40 * 1024 * 1024 };
const LINK_MINUTES = 30;

export default route(['POST'], async (req, res) => {
  const u = await requireUser(req, res);
  if (!u) return;
  const b = body(req);
  if (!MAX[b.kind] || !ID_RE.test(String(b.id)) || !['put', 'get'].includes(b.op)) return fail(res, 400, 'Not a valid file request.');
  if (!await allow('file:' + u.id, 2000, 900)) return fail(res, 429, 'Too many file requests. Wait a few minutes.');
  const pathname = `u/${u.id}/${b.kind}/${b.id}`;
  const validUntil = Date.now() + LINK_MINUTES * 60000;

  if (b.op === 'put') {
    const size = +b.size;
    if (!Number.isSafeInteger(size) || size < 0) return fail(res, 400, 'Not a valid file request.');
    if (size > MAX[b.kind]) return fail(res, 413, 'That file is too large to back up.');
    const [{ bytes }] = await q(`select coalesce(sum(size), 0)::bigint as bytes from files where user_id = $1 and path <> $2`, [u.id, pathname]);
    if (+bytes + size > QUOTA) return fail(res, 507, `Your cloud space is full (${Math.round(QUOTA / 1048576)} MB). Delete some files to back up more.`);
    await q(`insert into files(user_id, path, size) values($1, $2, $3) on conflict (user_id, path) do update set size = excluded.size`, [u.id, pathname, size]);
    const token = await issueSignedToken({ pathname, operations: ['put'], validUntil, maximumSizeInBytes: Math.max(1, size) });
    const { presignedUrl } = await presignUrl(token, { operation: 'put', pathname, access: 'private', validUntil, allowOverwrite: true, maximumSizeInBytes: Math.max(1, size) });
    return send(res, 200, { url: presignedUrl });
  }

  const known = await q(`select size from files where user_id = $1 and path = $2`, [u.id, pathname]);
  if (!known.length) return fail(res, 404, 'That file isn\'t in your cloud storage.');
  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname, access: 'private', validUntil, useCache: false });
  send(res, 200, { url: presignedUrl, size: +known[0].size });
});
