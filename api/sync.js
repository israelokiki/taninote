// Two-way sync of a user's records (file details, annotations, study plan, sounds).
// POST { cursor, changes: [{ store, id, data, m, deleted }] }
//   -> applies each change if it is newer than the server's copy (last write wins on `m`),
//      then returns everything changed since `cursor`, in pages of about 3 MB.
import { del } from '@vercel/blob';
import { route, body, send, fail, q, requireUser, ID_RE, STORES } from './_lib.js';

const MAX_CHANGES = 500;
const PAGE_BYTES = 3 * 1024 * 1024;
const FILE_KIND = { docs: 'doc', sounds: 'sound' };

export default route(['POST'], async (req, res) => {
  const u = await requireUser(req, res);
  if (!u) return;
  const b = body(req);
  const cursor = Number.isSafeInteger(+b.cursor) && +b.cursor > 0 ? +b.cursor : 0;
  const changes = Array.isArray(b.changes) ? b.changes : [];
  if (changes.length > MAX_CHANGES) return fail(res, 413, 'Too many changes at once.');

  const rows = [];
  for (const c of changes) {
    if (!c || !STORES.has(c.store) || !ID_RE.test(String(c.id)) || !Number.isSafeInteger(+c.m)) return fail(res, 400, 'A change was not valid.');
    const deleted = !!c.deleted;
    const data = deleted ? null : c.data;
    if (!deleted && (!data || typeof data !== 'object' || Array.isArray(data))) return fail(res, 400, 'A change was not valid.');
    rows.push({ store: c.store, id: String(c.id), data, m: +c.m, deleted, size: data ? JSON.stringify(data).length : 0 });
  }

  if (rows.length) {
    const applied = await q(
      `insert into records(user_id, store, id, data, m, deleted, size)
       select $1, x.store, x.id, x.data, x.m, x.deleted, x.size
       from jsonb_to_recordset($2::jsonb) as x(store text, id text, data jsonb, m bigint, deleted boolean, size integer)
       on conflict (user_id, store, id) do update
         set data = excluded.data, m = excluded.m, deleted = excluded.deleted, size = excluded.size, rev = nextval('rev_seq')
         where records.m < excluded.m
       returning store, id, deleted`,
      [u.id, JSON.stringify(rows)]);

    // A deletion that won also removes the stored file(s) behind it.
    const gone = [];
    for (const r of applied) {
      if (!r.deleted) continue;
      if (FILE_KIND[r.store]) gone.push(`u/${u.id}/${FILE_KIND[r.store]}/${r.id}`);
      gone.push(`u/${u.id}/rec/${r.store}-${r.id}`);
    }
    if (gone.length) {
      const known = await q(`delete from files where user_id = $1 and path = any($2::text[]) returning path`, [u.id, gone]);
      if (known.length) await del(known.map((k) => k.path)).catch((e) => console.error('blob delete', e));
    }
  }

  // Page the reply by size so it stays under the function response limit.
  const heads = await q(`select rev, size from records where user_id = $1 and rev > $2 order by rev limit 1000`, [u.id, cursor]);
  let until = cursor, total = 0;
  for (const h of heads) {
    if (total && total + h.size > PAGE_BYTES) break;
    total += h.size; until = +h.rev;
  }
  const out = until > cursor
    ? await q(`select store, id, data, m, deleted, rev from records where user_id = $1 and rev > $2 and rev <= $3 order by rev`, [u.id, cursor, until])
    : [];
  const more = heads.length > 0 && +heads[heads.length - 1].rev > until;
  const [{ bytes }] = await q(`select coalesce(sum(size), 0)::bigint as bytes from files where user_id = $1`, [u.id]);
  send(res, 200, {
    used: +bytes,
    cursor: until,
    more: more || heads.length === 1000,
    changes: out.map((r) => ({ store: r.store, id: r.id, data: r.data, m: +r.m, deleted: r.deleted })),
  });
});
