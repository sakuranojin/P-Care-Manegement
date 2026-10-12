import { Router, type Request } from 'express';
import { db, now, save, uid, type User } from '../db';
import { requireAuth, requireUnit, type AuthedRequest } from '../auth';
import { changedUnit, changedUsers } from '../realtime';
import type { Post, PostIdentity, PostReply } from '../../../shared/types';

/** Discussion board: posts visible to the whole unit, with files, likes and replies. */
const r = Router();
r.use(requireAuth, requireUnit);
const me = (req: Request) => (req as AuthedRequest).user;
const postFor = (req: Request) => db.posts.find((p) => p.id === req.params.id && p.unitId === me(req).unitId);

/** Nickname/anonymous posts never reveal who wrote them (only the author knows it is theirs). */
function identity(body: any): { identity: PostIdentity; nickname: string } | string {
  const id: PostIdentity = ['real', 'nickname', 'anonymous'].includes(body?.identity) ? body.identity : 'real';
  const nickname = String(body?.nickname ?? '').trim().slice(0, 20);
  if (id === 'nickname' && !nickname) return 'ニックネームを入力してください';
  return { identity: id, nickname: id === 'nickname' ? nickname : '' };
}
const mask = <T extends Post | PostReply>(x: T, u: User): T => ({
  ...x,
  authorId: x.identity === 'real' || !x.identity ? x.authorId : '',
  identity: x.identity ?? 'real',
  nickname: x.nickname ?? '',
  mine: x.authorId === u.id,
});
const view = (p: Post, u: User): Post => ({ ...mask(p, u), replies: p.replies.map((x) => mask(x, u)) });

r.get('/posts', (req, res) => {
  const u = me(req);
  res.json(db.posts.filter((p) => p.unitId === u.unitId).slice(-200).reverse().map((p) => view(p, u)));
});

/** Posts the user has looked at stop counting as new on the 掲示板 menu badge. */
r.post('/posts/seen', (req, res) => {
  const u = me(req);
  const ids = new Set(Array.isArray(req.body?.ids) ? req.body.ids.map(String) : []);
  let changed = false;
  for (const p of db.posts) {
    if (p.unitId !== u.unitId || !ids.has(p.id)) continue;
    p.seenBy = p.seenBy ?? [];
    if (!p.seenBy.includes(u.id)) {
      p.seenBy.push(u.id);
      changed = true;
    }
  }
  if (changed) {
    save();
    changedUsers([u.id], 'posts-seen');
  }
  res.json({ ok: true });
});

r.post('/posts', (req, res) => {
  const u = me(req);
  const who = identity(req.body);
  if (typeof who === 'string') return res.status(400).json({ error: who });
  const text = String(req.body?.text ?? '').trim().slice(0, 4000);
  const attachments = Array.isArray(req.body?.attachments)
    ? req.body.attachments.filter((a: any) => typeof a?.url === 'string' && a.url.startsWith('/uploads/')).slice(0, 6)
    : [];
  if (!text && !attachments.length) return res.status(400).json({ error: '本文またはファイルを入力してください' });
  const post: Post = { id: uid(), unitId: u.unitId!, authorId: u.id, ...who, text, attachments, likes: [], seenBy: [u.id], replies: [], createdAt: now() };
  db.posts.push(post);
  save();
  changedUnit(u.unitId, 'posts');
  res.json(view(post, u));
});

r.delete('/posts/:id', (req, res) => {
  const p = postFor(req);
  if (!p) return res.status(404).json({ error: '投稿が見つかりません' });
  if (p.authorId !== me(req).id) return res.status(403).json({ error: '削除できるのは投稿者本人のみです' });
  db.posts.splice(db.posts.indexOf(p), 1);
  save();
  changedUnit(p.unitId, 'posts');
  res.json({ ok: true });
});

/** One like per person; calling again removes it. */
r.post('/posts/:id/like', (req, res) => {
  const p = postFor(req);
  if (!p) return res.status(404).json({ error: '投稿が見つかりません' });
  const id = me(req).id;
  p.likes = p.likes.includes(id) ? p.likes.filter((x) => x !== id) : [...p.likes, id];
  save();
  changedUnit(p.unitId, 'posts');
  res.json(view(p, me(req)));
});

r.post('/posts/:id/replies', (req, res) => {
  const p = postFor(req);
  if (!p) return res.status(404).json({ error: '投稿が見つかりません' });
  const who = identity(req.body);
  if (typeof who === 'string') return res.status(400).json({ error: who });
  const text = String(req.body?.text ?? '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: '返信を入力してください' });
  p.replies.push({ id: uid(), authorId: me(req).id, ...who, text, createdAt: now() });
  save();
  changedUnit(p.unitId, 'posts');
  res.json(view(p, me(req)));
});

r.delete('/posts/:id/replies/:rid', (req, res) => {
  const p = postFor(req);
  const reply = p?.replies.find((x) => x.id === req.params.rid);
  if (!p || !reply) return res.status(404).json({ error: '返信が見つかりません' });
  if (reply.authorId !== me(req).id) return res.status(403).json({ error: '削除できるのは投稿者本人のみです' });
  p.replies = p.replies.filter((x) => x !== reply);
  save();
  changedUnit(p.unitId, 'posts');
  res.json(view(p, me(req)));
});

export default r;
