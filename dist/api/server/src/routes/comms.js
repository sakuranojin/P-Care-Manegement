"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../auth");
const realtime_1 = require("../realtime");
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth);
const me = (req) => req.user;
// ---------- Personal notices (invitations, visit updates…) ----------
r.get('/notices', (req, res) => res.json(db_1.db.notices.filter((n) => n.userId === me(req).id).reverse().slice(0, 100)));
/** Mark one notification as read (only that item stops counting as new). */
r.post('/notices/:id/read', (req, res) => {
    const n = db_1.db.notices.find((x) => x.id === req.params.id && x.userId === me(req).id);
    if (!n)
        return res.status(404).json({ error: '通知が見つかりません' });
    if (!n.read) {
        n.read = true;
        (0, db_1.save)();
        (0, realtime_1.changedUsers)([me(req).id], 'notices');
    }
    res.json(n);
});
r.post('/notices/read-all', (req, res) => {
    db_1.db.notices.filter((n) => n.userId === me(req).id).forEach((n) => (n.read = true));
    (0, db_1.save)();
    (0, realtime_1.changedUsers)([me(req).id], 'notices');
    res.json({ ok: true });
});
/** Badge counts for the navigation bar. */
r.get('/counts', (req, res) => {
    const u = me(req);
    const groups = db_1.db.groups.filter((g) => g.memberIds.includes(u.id));
    const groupIds = new Set(groups.map((g) => g.id));
    res.json({
        unreadMessages: db_1.db.messages.filter((m) => groupIds.has(m.groupId) && m.senderId !== u.id && !m.readBy.includes(u.id)).length,
        chatInvites: db_1.db.groups.filter((g) => g.pendingIds.includes(u.id)).length,
        unreadBroadcasts: u.unitId ? db_1.db.broadcasts.filter((b) => b.unitId === u.unitId && !b.readBy.includes(u.id)).length : 0,
        unreadNotices: db_1.db.notices.filter((n) => n.userId === u.id && !n.read).length,
        joinRequests: u.unitId && (0, auth_1.isManager)(u) ? db_1.db.joinRequests.filter((j) => j.unitId === u.unitId && j.status === 'pending').length : 0,
        unreadPosts: u.unitId ? db_1.db.posts.filter((p) => p.unitId === u.unitId && p.authorId !== u.id && !(p.seenBy ?? []).includes(u.id)).length : 0,
    });
});
r.use(auth_1.requireUnit);
/** Individual notification to one team member (sent from the TEAM screen). */
r.post('/notices/send', (req, res) => {
    const u = me(req);
    if (!(0, auth_1.seesAll)(u))
        return res.status(403).json({ error: '個別通知を送信できるのは管理者権限を持つユーザーのみです' });
    const target = db_1.db.users.find((x) => x.id === req.body?.userId && x.unitId === u.unitId);
    if (!target || target.id === u.id)
        return res.status(404).json({ error: '送信先が見つかりません' });
    const text = String(req.body?.text ?? '').trim().slice(0, 500);
    if (!text)
        return res.status(400).json({ error: 'メッセージを入力してください' });
    (0, realtime_1.notify)(target.id, 'message', `${u.name}さんより: ${text}`, '', u.id);
    res.json({ ok: true });
});
// ---------- Broadcast notifications (admins send, everyone reads) ----------
r.get('/broadcasts', (req, res) => res.json(db_1.db.broadcasts.filter((b) => b.unitId === me(req).unitId).reverse()));
r.post('/broadcasts', (req, res) => {
    const u = me(req);
    if (!(0, auth_1.isManager)(u))
        return res.status(403).json({ error: 'お知らせを送信できるのは管理者権限を持つユーザーのみです' });
    const title = String(req.body?.title ?? '').trim();
    const body = String(req.body?.body ?? '').trim();
    if (!title || !body)
        return res.status(400).json({ error: '件名と本文を入力してください' });
    const b = { id: (0, db_1.uid)(), unitId: u.unitId, authorId: u.id, title, body, createdAt: (0, db_1.now)(), readBy: [u.id] };
    db_1.db.broadcasts.push(b);
    (0, db_1.save)();
    (0, realtime_1.changedUnit)(u.unitId, 'broadcasts');
    res.json(b);
});
r.post('/broadcasts/:id/read', (req, res) => {
    const u = me(req);
    const b = db_1.db.broadcasts.find((x) => x.id === req.params.id && x.unitId === u.unitId);
    if (!b)
        return res.status(404).json({ error: 'お知らせが見つかりません' });
    if (!b.readBy.includes(u.id)) {
        b.readBy.push(u.id);
        (0, db_1.save)();
        (0, realtime_1.changedUsers)([u.id], 'broadcasts');
    }
    res.json({ ok: true });
});
r.post('/broadcasts/read-all', (req, res) => {
    const u = me(req);
    db_1.db.broadcasts.filter((b) => b.unitId === u.unitId && !b.readBy.includes(u.id)).forEach((b) => b.readBy.push(u.id));
    (0, db_1.save)();
    (0, realtime_1.changedUsers)([u.id], 'broadcasts');
    res.json({ ok: true });
});
// ---------- Chat ----------
const groupFor = (u, id) => db_1.db.groups.find((g) => g.id === id && g.memberIds.includes(u.id));
const everyone = (g) => [...g.memberIds, ...g.pendingIds];
function summarize(u, g) {
    const msgs = db_1.db.messages.filter((m) => m.groupId === g.id);
    return {
        ...g,
        pending: g.pendingIds.includes(u.id),
        lastMessage: msgs[msgs.length - 1] ?? null,
        unread: msgs.filter((m) => m.senderId !== u.id && !m.readBy.includes(u.id)).length,
    };
}
r.get('/chat/groups', (req, res) => {
    const u = me(req);
    const list = db_1.db.groups.filter((g) => g.unitId === u.unitId && everyone(g).includes(u.id)).map((g) => summarize(u, g));
    list.sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt));
    res.json(list);
});
/** Add members. Admins/managers connect people immediately; others send a request that must be approved. */
function addMembers(u, g, ids) {
    const valid = ids.filter((id) => id !== u.id && !everyone(g).includes(id) && db_1.db.users.some((x) => x.id === id && x.unitId === u.unitId));
    const label = g.name || 'チャット';
    for (const id of valid) {
        if ((0, auth_1.isManager)(u)) {
            g.memberIds.push(id);
            (0, realtime_1.notify)(id, 'chat_invite', `${u.name}さんが「${label}」にあなたを追加しました`, `/app/chat?g=${g.id}`);
        }
        else {
            g.pendingIds.push(id);
            (0, realtime_1.notify)(id, 'chat_invite', `${u.name}さんから「${label}」への参加リクエストが届いています`, `/app/chat?g=${g.id}`);
        }
    }
    return valid;
}
r.post('/chat/groups', (req, res) => {
    const u = me(req);
    const ids = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [];
    if (!ids.length)
        return res.status(400).json({ error: 'メンバーを1人以上選択してください' });
    const g = {
        id: (0, db_1.uid)(), unitId: u.unitId, name: String(req.body?.name ?? '').trim(), direct: false, memberIds: [u.id], pendingIds: [],
        createdBy: u.id, createdAt: (0, db_1.now)(),
    };
    if (!addMembers(u, g, ids).length)
        return res.status(400).json({ error: '有効なメンバーが選択されていません' });
    db_1.db.groups.push(g);
    (0, db_1.save)();
    (0, realtime_1.changedUsers)(everyone(g), 'chat');
    res.json(summarize(u, g));
});
/**
 * Open (or request) a one-to-one conversation. Administrators connect immediately;
 * anyone else's request must be approved by the other person before they can talk.
 */
r.post('/chat/direct', (req, res) => {
    const u = me(req);
    const target = db_1.db.users.find((x) => x.id === req.body?.userId && x.unitId === u.unitId);
    if (!target || target.id === u.id)
        return res.status(404).json({ error: '相手が見つかりません' });
    const pair = (x) => x.direct && x.unitId === u.unitId && everyone(x).length === 2 && everyone(x).includes(u.id) && everyone(x).includes(target.id);
    let g = db_1.db.groups.find(pair);
    if (!g) {
        const immediate = (0, auth_1.seesAll)(u);
        g = {
            id: (0, db_1.uid)(), unitId: u.unitId, name: '', direct: true, createdBy: u.id, createdAt: (0, db_1.now)(),
            memberIds: immediate ? [u.id, target.id] : [u.id], pendingIds: immediate ? [] : [target.id],
        };
        db_1.db.groups.push(g);
        (0, db_1.save)();
        (0, realtime_1.notify)(target.id, 'chat_invite', immediate ? `${u.name}さんがあなたとの個別チャットを開始しました` : `${u.name}さんから個別チャットのリクエストが届いています`, `/app/chat?g=${g.id}`, u.id);
        (0, realtime_1.changedUsers)(everyone(g), 'chat');
    }
    res.json(summarize(u, g));
});
r.post('/chat/groups/:id/members', (req, res) => {
    const u = me(req);
    const g = groupFor(u, req.params.id);
    if (!g)
        return res.status(404).json({ error: 'グループが見つかりません' });
    addMembers(u, g, Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : []);
    (0, db_1.save)();
    (0, realtime_1.changedUsers)(everyone(g), 'chat');
    res.json(summarize(u, g));
});
r.post('/chat/groups/:id/:action(accept|decline)', (req, res) => {
    const u = me(req);
    const g = db_1.db.groups.find((x) => x.id === req.params.id && x.pendingIds.includes(u.id));
    if (!g)
        return res.status(404).json({ error: 'リクエストが見つかりません' });
    g.pendingIds = g.pendingIds.filter((id) => id !== u.id);
    if (req.params.action === 'accept')
        g.memberIds.push(u.id);
    (0, db_1.save)();
    (0, realtime_1.changedUsers)([...everyone(g), u.id], 'chat');
    res.json({ ok: true });
});
r.post('/chat/groups/:id/leave', (req, res) => {
    const u = me(req);
    const g = groupFor(u, req.params.id);
    if (!g)
        return res.status(404).json({ error: 'グループが見つかりません' });
    g.memberIds = g.memberIds.filter((id) => id !== u.id);
    (0, db_1.save)();
    (0, realtime_1.changedUsers)([...everyone(g), u.id], 'chat');
    res.json({ ok: true });
});
r.get('/chat/groups/:id/messages', (req, res) => {
    const u = me(req);
    const g = groupFor(u, req.params.id);
    if (!g)
        return res.status(404).json({ error: 'グループが見つかりません' });
    res.json(db_1.db.messages.filter((m) => m.groupId === g.id));
});
r.post('/chat/groups/:id/messages', (req, res) => {
    const u = me(req);
    const g = groupFor(u, req.params.id);
    if (!g)
        return res.status(404).json({ error: 'グループが見つかりません' });
    const text = String(req.body?.text ?? '').trim();
    const attachments = Array.isArray(req.body?.attachments)
        ? req.body.attachments.filter((a) => typeof a?.url === 'string' && a.url.startsWith('/uploads/'))
        : [];
    if (!text && !attachments.length)
        return res.status(400).json({ error: 'メッセージを入力してください' });
    if (g.direct && g.pendingIds.length)
        return res.status(403).json({ error: '相手が個別チャットを承認するまでメッセージは送信できません' });
    const replyTo = db_1.db.messages.some((m) => m.id === req.body?.replyTo && m.groupId === g.id) ? String(req.body.replyTo) : null;
    const m = { id: (0, db_1.uid)(), groupId: g.id, senderId: u.id, text, attachments, replyTo, createdAt: (0, db_1.now)(), readBy: [u.id] };
    db_1.db.messages.push(m);
    (0, db_1.save)();
    (0, realtime_1.changedUsers)(g.memberIds, 'chat', `chat:${g.id}`);
    res.json(m);
});
/** Edit or delete your own message. */
const ownMessage = (req) => {
    const u = me(req);
    const m = db_1.db.messages.find((x) => x.id === req.params.mid);
    const g = m && groupFor(u, m.groupId);
    return m && g && m.senderId === u.id ? { m, g } : null;
};
r.put('/chat/messages/:mid', (req, res) => {
    const found = ownMessage(req);
    if (!found)
        return res.status(403).json({ error: '編集できるのは自分のメッセージのみです' });
    const text = String(req.body?.text ?? '').trim();
    if (!text && !found.m.attachments.length)
        return res.status(400).json({ error: 'メッセージを入力してください' });
    Object.assign(found.m, { text, editedAt: (0, db_1.now)() });
    (0, db_1.save)();
    (0, realtime_1.changedUsers)(found.g.memberIds, 'chat', `chat:${found.g.id}`);
    res.json(found.m);
});
r.delete('/chat/messages/:mid', (req, res) => {
    const found = ownMessage(req);
    if (!found)
        return res.status(403).json({ error: '削除できるのは自分のメッセージのみです' });
    db_1.db.messages.splice(db_1.db.messages.indexOf(found.m), 1);
    (0, db_1.save)();
    (0, realtime_1.changedUsers)(found.g.memberIds, 'chat', `chat:${found.g.id}`);
    res.json({ ok: true });
});
/**
 * Delete a group with its history. Group: its creator or an administrator/proxy.
 * Direct chat: either person — this disconnects the two of them.
 */
r.delete('/chat/groups/:id', (req, res) => {
    const u = me(req);
    const g = groupFor(u, req.params.id);
    if (!g)
        return res.status(404).json({ error: 'グループが見つかりません' });
    if (!g.direct && g.createdBy !== u.id && !(0, auth_1.isManager)(u))
        return res.status(403).json({ error: 'グループを削除できるのは作成者または管理者のみです' });
    db_1.db.groups.splice(db_1.db.groups.indexOf(g), 1);
    db_1.db.messages = db_1.db.messages.filter((m) => m.groupId !== g.id);
    (0, db_1.save)();
    (0, realtime_1.changedUsers)(everyone(g), 'chat');
    res.json({ ok: true });
});
/** Remove a member from a group (creator or administrator/proxy). */
r.post('/chat/groups/:id/remove', (req, res) => {
    const u = me(req);
    const g = groupFor(u, req.params.id);
    if (!g || g.direct)
        return res.status(404).json({ error: 'グループが見つかりません' });
    if (g.createdBy !== u.id && !(0, auth_1.isManager)(u))
        return res.status(403).json({ error: 'メンバーを外せるのは作成者または管理者のみです' });
    const target = String(req.body?.userId ?? '');
    const before = everyone(g);
    g.memberIds = g.memberIds.filter((id) => id !== target);
    g.pendingIds = g.pendingIds.filter((id) => id !== target);
    (0, db_1.save)();
    (0, realtime_1.changedUsers)(before, 'chat');
    res.json(summarize(u, g));
});
/** Mark messages as read → the sender sees「既読」. */
r.post('/chat/groups/:id/read', (req, res) => {
    const u = me(req);
    const g = groupFor(u, req.params.id);
    if (!g)
        return res.status(404).json({ error: 'グループが見つかりません' });
    let changed = false;
    for (const m of db_1.db.messages) {
        if (m.groupId === g.id && !m.readBy.includes(u.id)) {
            m.readBy.push(u.id);
            changed = true;
        }
    }
    if (changed) {
        (0, db_1.save)();
        (0, realtime_1.changedUsers)(g.memberIds, 'chat', `chat:${g.id}`);
    }
    res.json({ ok: true });
});
exports.default = r;
