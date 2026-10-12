"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../auth");
const realtime_1 = require("../realtime");
/** Discussion board: posts visible to the whole unit, with files, likes and replies. */
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth, auth_1.requireUnit);
const me = (req) => req.user;
const postFor = (req) => db_1.db.posts.find((p) => p.id === req.params.id && p.unitId === me(req).unitId);
/** Nickname/anonymous posts never reveal who wrote them (only the author knows it is theirs). */
function identity(body) {
    const id = ['real', 'nickname', 'anonymous'].includes(body?.identity) ? body.identity : 'real';
    const nickname = String(body?.nickname ?? '').trim().slice(0, 20);
    if (id === 'nickname' && !nickname)
        return 'ニックネームを入力してください';
    return { identity: id, nickname: id === 'nickname' ? nickname : '' };
}
const mask = (x, u) => ({
    ...x,
    authorId: x.identity === 'real' || !x.identity ? x.authorId : '',
    identity: x.identity ?? 'real',
    nickname: x.nickname ?? '',
    mine: x.authorId === u.id,
});
const view = (p, u) => ({ ...mask(p, u), replies: p.replies.map((x) => mask(x, u)) });
r.get('/posts', (req, res) => {
    const u = me(req);
    res.json(db_1.db.posts.filter((p) => p.unitId === u.unitId).slice(-200).reverse().map((p) => view(p, u)));
});
/** Posts the user has looked at stop counting as new on the 掲示板 menu badge. */
r.post('/posts/seen', (req, res) => {
    const u = me(req);
    const ids = new Set(Array.isArray(req.body?.ids) ? req.body.ids.map(String) : []);
    let changed = false;
    for (const p of db_1.db.posts) {
        if (p.unitId !== u.unitId || !ids.has(p.id))
            continue;
        p.seenBy = p.seenBy ?? [];
        if (!p.seenBy.includes(u.id)) {
            p.seenBy.push(u.id);
            changed = true;
        }
    }
    if (changed) {
        (0, db_1.save)();
        (0, realtime_1.changedUsers)([u.id], 'posts-seen');
    }
    res.json({ ok: true });
});
r.post('/posts', (req, res) => {
    const u = me(req);
    const who = identity(req.body);
    if (typeof who === 'string')
        return res.status(400).json({ error: who });
    const text = String(req.body?.text ?? '').trim().slice(0, 4000);
    const attachments = Array.isArray(req.body?.attachments)
        ? req.body.attachments.filter((a) => typeof a?.url === 'string' && a.url.startsWith('/uploads/')).slice(0, 6)
        : [];
    if (!text && !attachments.length)
        return res.status(400).json({ error: '本文またはファイルを入力してください' });
    const post = { id: (0, db_1.uid)(), unitId: u.unitId, authorId: u.id, ...who, text, attachments, likes: [], seenBy: [u.id], replies: [], createdAt: (0, db_1.now)() };
    db_1.db.posts.push(post);
    (0, db_1.save)();
    (0, realtime_1.changedUnit)(u.unitId, 'posts');
    res.json(view(post, u));
});
r.delete('/posts/:id', (req, res) => {
    const p = postFor(req);
    if (!p)
        return res.status(404).json({ error: '投稿が見つかりません' });
    if (p.authorId !== me(req).id)
        return res.status(403).json({ error: '削除できるのは投稿者本人のみです' });
    db_1.db.posts.splice(db_1.db.posts.indexOf(p), 1);
    (0, db_1.save)();
    (0, realtime_1.changedUnit)(p.unitId, 'posts');
    res.json({ ok: true });
});
/** One like per person; calling again removes it. */
r.post('/posts/:id/like', (req, res) => {
    const p = postFor(req);
    if (!p)
        return res.status(404).json({ error: '投稿が見つかりません' });
    const id = me(req).id;
    p.likes = p.likes.includes(id) ? p.likes.filter((x) => x !== id) : [...p.likes, id];
    (0, db_1.save)();
    (0, realtime_1.changedUnit)(p.unitId, 'posts');
    res.json(view(p, me(req)));
});
r.post('/posts/:id/replies', (req, res) => {
    const p = postFor(req);
    if (!p)
        return res.status(404).json({ error: '投稿が見つかりません' });
    const who = identity(req.body);
    if (typeof who === 'string')
        return res.status(400).json({ error: who });
    const text = String(req.body?.text ?? '').trim().slice(0, 1000);
    if (!text)
        return res.status(400).json({ error: '返信を入力してください' });
    p.replies.push({ id: (0, db_1.uid)(), authorId: me(req).id, ...who, text, createdAt: (0, db_1.now)() });
    (0, db_1.save)();
    (0, realtime_1.changedUnit)(p.unitId, 'posts');
    res.json(view(p, me(req)));
});
r.delete('/posts/:id/replies/:rid', (req, res) => {
    const p = postFor(req);
    const reply = p?.replies.find((x) => x.id === req.params.rid);
    if (!p || !reply)
        return res.status(404).json({ error: '返信が見つかりません' });
    if (reply.authorId !== me(req).id)
        return res.status(403).json({ error: '削除できるのは投稿者本人のみです' });
    p.replies = p.replies.filter((x) => x !== reply);
    (0, db_1.save)();
    (0, realtime_1.changedUnit)(p.unitId, 'posts');
    res.json(view(p, me(req)));
});
exports.default = r;
