import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { sendMail } from '../mail';
import { db, now, save, uid, UPLOAD_DIR, type User } from '../db';
import { isManager, pub, requireAuth, requireUnit, sign, type AuthedRequest } from '../auth';
import { activity, changedUnit, changedUsers, joinUnitRoom, notify } from '../realtime';
import { isOnline } from '../presence';
import type { Gender, Permission, Role, StaffStatus } from '../../../shared/types';
import { AREAS } from '../../../shared/areas';
import { permissionLabel, roleLabel } from '../../../shared/labels';

const r = Router();
const me = (req: Request) => (req as AuthedRequest).user;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS: Gender[] = ['male', 'female'];
const ROLES: Role[] = ['admin', 'nurse', 'doctor'];
const unitOf = (u: User) => db.units.find((x) => x.id === u.unitId) ?? null;

// ---------- Authentication ----------
r.post('/auth/register', (req, res) => {
  const { email, password, passwordConfirm } = req.body ?? {};
  const mail = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) return res.status(400).json({ error: 'メールアドレスの形式が正しくありません' });
  if (String(password ?? '').length < 8) return res.status(400).json({ error: 'パスワードは8文字以上で入力してください' });
  if (password !== passwordConfirm) return res.status(400).json({ error: 'パスワード（確認）が一致しません' });
  if (db.users.some((u) => u.email === mail)) return res.status(409).json({ error: 'このメールアドレスは既に登録されています' });
  const user: User = {
    id: uid(), email: mail, passwordHash: bcrypt.hashSync(password, 10), name: '', gender: 'other', birthDate: '',
    role: 'nurse', avatar: 'preset:1', jobTitle: '', phone: '', area: '', unitId: null, permission: null, manualStatus: 'waiting',
    profileCompleted: false, createdUnit: false, createdAt: now(),
  };
  db.users.push(user);
  save();
  res.json({ token: sign(user.id), user: pub(user) });
});

r.post('/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const user = db.users.find((u) => u.email === String(email ?? '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(password ?? ''), user.passwordHash)) {
    return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
  }
  res.json({ token: sign(user.id), user: pub(user) });
});

r.use(requireAuth);

r.get('/auth/me', (req, res) => {
  const u = me(req);
  res.json({ user: pub(u), unit: unitOf(u) });
});

r.put('/auth/profile', (req, res) => {
  const u = me(req);
  const { avatar, name, gender, birthDate, jobTitle, area, phone } = req.body ?? {};
  // The job role (職種) is fixed once registered; everything else can be edited.
  const role: Role = u.profileCompleted ? u.role : req.body?.role;
  if (u.profileCompleted && req.body?.role && req.body.role !== u.role) return res.status(400).json({ error: '職種は登録後に変更できません' });
  if (!String(name ?? '').trim()) return res.status(400).json({ error: '氏名を入力してください' });
  if (!GENDERS.includes(gender)) return res.status(400).json({ error: '性別を選択してください' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate ?? ''))) return res.status(400).json({ error: '生年月日を入力してください' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: '職種を選択してください' });
  if (u.permission === 'owner' && role !== 'admin') return res.status(400).json({ error: 'ユニット作成者は管理者から職種を変更できません' });
  if (area && !AREAS.some((a) => a.id === area)) return res.status(400).json({ error: '拠点エリアが不正です' });
  const tel = String(phone ?? '').trim();
  if (role !== 'admin' && !/^[0-9+\-() ]{9,16}$/.test(tel)) return res.status(400).json({ error: '電話番号を入力してください（例: 090-1234-5678）' });
  // Avatar: a photo uploaded from the user's PC, otherwise the male (blue) / female icon.
  const keep = typeof avatar === 'string' && avatar === u.avatar && !u.avatar.startsWith('default:');
  const pic = typeof avatar === 'string' && (avatar.startsWith('/uploads/') || keep) ? avatar : `default:${gender}`;
  Object.assign(u, {
    avatar: pic, name: String(name).trim(), gender, birthDate, role, phone: tel,
    jobTitle: String(jobTitle ?? '').trim() || roleLabel[role as Role], area: area || u.area, profileCompleted: true,
  });
  save();
  changedUnit(u.unitId, 'team');
  res.json({ user: pub(u) });
});

r.put('/auth/password', (req, res) => {
  const u = me(req);
  const { currentPassword, newPassword, newPasswordConfirm } = req.body ?? {};
  if (!bcrypt.compareSync(String(currentPassword ?? ''), u.passwordHash)) return res.status(400).json({ error: '現在のパスワードが正しくありません' });
  if (String(newPassword ?? '').length < 8) return res.status(400).json({ error: '新しいパスワードは8文字以上で入力してください' });
  if (newPassword !== newPasswordConfirm) return res.status(400).json({ error: '新しいパスワード（確認）が一致しません' });
  u.passwordHash = bcrypt.hashSync(newPassword, 10);
  save();
  res.json({ ok: true });
});

/** Status is automatic; only administrators may switch between 待機中 and 取込中. */
r.put('/auth/status', (req, res) => {
  const u = me(req);
  if (u.role !== 'admin') return res.status(403).json({ error: 'ステータスは自動で設定されます' });
  const status = req.body?.status as StaffStatus;
  if (status !== 'waiting' && status !== 'busy') return res.status(400).json({ error: 'ステータスが不正です' });
  u.manualStatus = status;
  save();
  changedUnit(u.unitId, 'team');
  res.json({ user: pub(u) });
});

// ---------- File upload (avatars, reports, condition updates, chat) ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, uid() + path.extname(file.originalname).toLowerCase().slice(0, 10)),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});
r.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルがありません' });
  // multer decodes multipart filenames as latin1; restore UTF-8 Japanese names.
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  res.json({ name, url: `/uploads/${req.file.filename}`, type: req.file.mimetype, size: req.file.size });
});

// ---------- Affiliated unit ----------
r.post('/units', (req, res) => {
  const u = me(req);
  if (!u.profileCompleted) return res.status(403).json({ error: 'プロフィール登録を完了してください' });
  if (u.role !== 'admin') return res.status(403).json({ error: '所属ユニットを作成できるのは管理者のみです' });
  if (u.createdUnit) return res.status(400).json({ error: '所属ユニットは1回のみ作成できます' });
  if (u.unitId) return res.status(400).json({ error: '既に所属ユニットに参加しています' });
  const name = String(req.body?.name ?? '').trim();
  const address = String(req.body?.address ?? '').trim();
  if (!name || !address) return res.status(400).json({ error: 'ユニット名と住所を入力してください' });
  const unit = { id: uid(), name, address, ownerId: u.id, createdAt: now() };
  db.units.push(unit);
  Object.assign(u, { unitId: unit.id, permission: 'owner', createdUnit: true });
  save();
  joinUnitRoom(u.id, unit.id);
  res.json({ unit, user: pub(u) });
});

r.put('/units/mine', requireUnit, (req, res) => {
  const u = me(req);
  // Proxies (代理) cannot change the unit; only administrators who manage it can.
  if (!isManager(u) || u.role !== 'admin') return res.status(403).json({ error: '所属ユニットを変更できるのは管理者のみです（代理は変更できません）' });
  const unit = unitOf(u)!;
  const name = String(req.body?.name ?? '').trim();
  const address = String(req.body?.address ?? '').trim();
  if (!name || !address) return res.status(400).json({ error: 'ユニット名と住所を入力してください' });
  Object.assign(unit, { name, address });
  save();
  changedUnit(unit.id, 'unit', 'team');
  res.json({ unit });
});

// ---------- Team ----------
r.get('/team', requireUnit, (req, res) => {
  res.json(db.users.filter((x) => x.unitId === me(req).unitId).map(pub));
});

r.get('/users/:id', requireUnit, (req, res) => {
  const target = db.users.find((x) => x.id === req.params.id && x.unitId === me(req).unitId);
  if (!target) return res.status(404).json({ error: 'スタッフが見つかりません' });
  res.json(pub(target));
});

r.get('/stats', requireUnit, (req, res) => {
  const u = me(req);
  const members = db.users.filter((x) => x.unitId === u.unitId);
  res.json({
    teamCount: members.length,
    onlineCount: members.filter((x) => isOnline(x.id)).length,
    patientCount: db.patients.filter((p) => p.unitId === u.unitId).length,
  });
});

r.put('/team/:id/permission', requireUnit, (req, res) => {
  const u = me(req);
  if (!isManager(u)) return res.status(403).json({ error: '権限を付与できるのは管理者のみです' });
  const target = db.users.find((x) => x.id === req.params.id && x.unitId === u.unitId);
  if (!target) return res.status(404).json({ error: 'スタッフが見つかりません' });
  if (target.permission === 'owner') return res.status(400).json({ error: 'ユニット作成者の権限は変更できません' });
  const p = req.body?.permission as Permission;
  if (!['manager', 'schedule_edit', 'read_only'].includes(p)) return res.status(400).json({ error: '権限が不正です' });
  // Designating or removing a proxy (代理) is reserved for administrators.
  if ((p === 'manager' || target.permission === 'manager') && u.role !== 'admin') {
    return res.status(403).json({ error: '代理の指定・解除は管理者のみ可能です' });
  }
  const before = target.permission;
  target.permission = p;
  save();
  // Tell the person exactly what they can now do.
  const can: Record<string, string> = {
    manager: '管理者と同等の権限です。メンバーの招待・参加申請の承認、権限付与、全体へのお知らせ送信、全患者・全訪問予定の閲覧ができます（代理の指定・所属ユニットの変更はできません）。',
    schedule_edit: '担当患者の訪問予定の追加・変更・キャンセルができます。',
    read_only: '訪問予定や患者情報は閲覧のみです。予定の追加・変更はできません。',
  };
  if (before !== p) {
    notify(target.id, 'info', `【権限変更】${u.name}さんがあなたの権限を「${permissionLabel[p]}」に変更しました（変更前：${before ? permissionLabel[before] : 'なし'}）。${can[p]}`, '/app/profile', u.id);
  }
  changedUnit(u.unitId, 'team', 'me');
  res.json(pub(target));
});

// ---------- Invitations ----------
r.get('/invitations/candidates', requireUnit, (req, res) => {
  const u = me(req);
  if (!isManager(u)) return res.status(403).json({ error: '招待できるのは管理者のみです' });
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const list = db.users
    .filter((x) => x.profileCompleted && x.unitId !== u.unitId)
    .filter((x) => !q || x.email.includes(q) || x.name.toLowerCase().includes(q))
    .slice(0, 30)
    .map((x) => ({
      ...pub(x),
      hasUnit: !!x.unitId,
      invited: db.invitations.some((i) => i.inviteeId === x.id && i.unitId === u.unitId && i.status === 'pending'),
    }));
  res.json(list);
});

r.post('/invitations', requireUnit, async (req, res) => {
  const u = me(req);
  if (!isManager(u)) return res.status(403).json({ error: '招待できるのは管理者のみです' });
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const target = db.users.find((x) => x.email === email);
  if (!target) return res.status(404).json({ error: 'このメールアドレスのユーザーは登録されていません。先にサービスへの登録を依頼してください' });
  if (target.unitId === u.unitId) return res.status(400).json({ error: '既にこのユニットのメンバーです' });
  if (target.unitId) return res.status(400).json({ error: 'このユーザーは既に他の所属ユニットに参加しているため、招待を送信できません' });
  if (db.invitations.some((i) => i.inviteeId === target.id && i.unitId === u.unitId && i.status === 'pending')) {
    return res.status(400).json({ error: '既に招待済みです' });
  }
  const inv = { id: uid(), unitId: u.unitId!, inviterId: u.id, inviteeId: target.id, status: 'pending' as const, createdAt: now() };
  db.invitations.push(inv);
  save();
  const unit = unitOf(u)!;
  notify(target.id, 'invitation', `${u.name}さんから「${unit.name}」への招待が届いています`, '/app');
  changedUsers([target.id], 'invitations');
  const status = await sendMail(
    target.email,
    `【P-CARE-MANAGEMENT】「${unit.name}」への招待`,
    `${target.name} 様\n\n${u.name}さんから「${unit.name}」への招待が届いています。\nP-CARE-MANAGEMENTにログインして招待を承認してください。\n\n${process.env.PUBLIC_URL ?? ''}`,
  );
  res.json({ invitation: inv, emailed: status === 'sent' });
});

r.get('/invitations/mine', (req, res) => {
  const u = me(req);
  res.json(
    db.invitations
      .filter((i) => i.inviteeId === u.id && i.status === 'pending')
      .map((i) => ({
        ...i,
        unit: db.units.find((x) => x.id === i.unitId),
        inviter: pub(db.users.find((x) => x.id === i.inviterId)!),
      })),
  );
});

r.get('/invitations/sent', requireUnit, (req, res) => {
  const u = me(req);
  res.json(
    db.invitations
      .filter((i) => i.unitId === u.unitId)
      .map((i) => ({ ...i, invitee: pub(db.users.find((x) => x.id === i.inviteeId)!) }))
      .reverse(),
  );
});

r.post('/invitations/:id/:action(accept|decline)', (req, res) => {
  const u = me(req);
  const inv = db.invitations.find((i) => i.id === req.params.id && i.inviteeId === u.id && i.status === 'pending');
  if (!inv) return res.status(404).json({ error: '招待が見つかりません' });
  if (req.params.action === 'decline') {
    inv.status = 'declined';
    save();
    notify(inv.inviterId, 'info', `${u.name}さんが招待を辞退しました`);
    return res.json({ ok: true });
  }
  if (!u.profileCompleted) return res.status(400).json({ error: 'プロフィール登録を完了してください' });
  if (u.unitId) return res.status(400).json({ error: '既に他のユニットに所属しています' });
  inv.status = 'accepted';
  joinUnit(u, inv.unitId);
  notify(inv.inviterId, 'info', `${u.name}さん（${roleLabel[u.role]}）がユニットに参加しました`, '/app/team');
  res.json({ user: pub(u), unit: unitOf(u) });
});

/** Add a user to a unit; their other pending invitations and join requests become void. */
function joinUnit(u: User, unitId: string) {
  Object.assign(u, { unitId, permission: u.role === 'nurse' ? 'schedule_edit' : 'read_only' });
  db.invitations.filter((i) => i.inviteeId === u.id && i.status === 'pending').forEach((i) => (i.status = 'declined'));
  db.joinRequests.filter((j) => j.userId === u.id && j.status === 'pending' && j.unitId !== unitId).forEach((j) => (j.status = 'withdrawn'));
  save();
  joinUnitRoom(u.id, unitId);
  activity(unitId, 'member_joined', `${u.name}さん（${roleLabel[u.role]}）がチームに参加しました`, u.id, []);
  changedUnit(unitId, 'team', 'join-requests');
}

// ---------- Join requests (registrant → unit) ----------
const managersOf = (unitId: string) => db.users.filter((x) => x.unitId === unitId && isManager(x)).map((x) => x.id);

/** Units a registrant can apply to. */
r.get('/units/search', (req, res) => {
  const u = me(req);
  if (u.unitId) return res.json([]);
  const q = String(req.query.q ?? '').trim();
  res.json(
    db.units
      .filter((x) => !q || x.name.includes(q) || x.address.includes(q))
      .slice(0, 50)
      .map((x) => ({ id: x.id, name: x.name, address: x.address, members: db.users.filter((m) => m.unitId === x.id).length })),
  );
});

r.get('/join-requests/mine', (req, res) => {
  const u = me(req);
  const mine = db.joinRequests.filter((j) => j.userId === u.id);
  const latest = mine[mine.length - 1];
  res.json({
    pending: mine.find((j) => j.status === 'pending') ?? null,
    // The most recent request cancelled by the unit (shown until the user applies elsewhere).
    cancelled: latest?.status === 'cancelled' ? latest : null,
    units: Object.fromEntries(db.units.filter((x) => mine.some((j) => j.unitId === x.id)).map((x) => [x.id, x.name])),
  });
});

r.post('/join-requests', (req, res) => {
  const u = me(req);
  if (!u.profileCompleted) return res.status(400).json({ error: 'プロフィール登録を完了してください' });
  if (u.unitId) return res.status(400).json({ error: '既に所属ユニットに参加しています' });
  const unit = db.units.find((x) => x.id === req.body?.unitId);
  if (!unit) return res.status(404).json({ error: '所属ユニットが見つかりません' });
  if (db.joinRequests.some((j) => j.userId === u.id && j.status === 'pending')) {
    return res.status(400).json({ error: '申請中のユニットがあります。取り消してから別のユニットに申請してください' });
  }
  const jr = { id: uid(), unitId: unit.id, userId: u.id, status: 'pending' as const, createdAt: now(), decidedAt: null, decidedBy: null };
  db.joinRequests.push(jr);
  save();
  managersOf(unit.id).forEach((id) => notify(id, 'invitation', `${u.name}さん（${roleLabel[u.role]}）から所属ユニットへの参加申請が届いています`, '/app/team', u.id));
  changedUnit(unit.id, 'join-requests');
  changedUsers([u.id], 'join-requests');
  res.json(jr);
});

/** The registrant withdraws their own request. */
r.post('/join-requests/:id/withdraw', (req, res) => {
  const u = me(req);
  const jr = db.joinRequests.find((j) => j.id === req.params.id && j.userId === u.id && j.status === 'pending');
  if (!jr) return res.status(404).json({ error: '申請が見つかりません' });
  Object.assign(jr, { status: 'withdrawn', decidedAt: now(), decidedBy: u.id });
  save();
  changedUnit(jr.unitId, 'join-requests');
  changedUsers([u.id], 'join-requests');
  res.json(jr);
});

/** Pending requests for the administrator's unit. */
r.get('/join-requests', requireUnit, (req, res) => {
  const u = me(req);
  if (!isManager(u)) return res.json([]);
  res.json(
    db.joinRequests
      .filter((j) => j.unitId === u.unitId && j.status === 'pending')
      .map((j) => ({ ...j, user: pub(db.users.find((x) => x.id === j.userId)!) })),
  );
});

/** Administrators approve (the user joins) or cancel (the user is told to apply elsewhere). */
r.post('/join-requests/:id/:action(approve|cancel)', requireUnit, (req, res) => {
  const u = me(req);
  if (!isManager(u)) return res.status(403).json({ error: '参加申請を処理できるのは管理者のみです' });
  const jr = db.joinRequests.find((j) => j.id === req.params.id && j.unitId === u.unitId && j.status === 'pending');
  if (!jr) return res.status(404).json({ error: '申請が見つかりません' });
  const target = db.users.find((x) => x.id === jr.userId)!;
  const unit = unitOf(u)!;
  if (req.params.action === 'approve') {
    if (target.unitId) return res.status(400).json({ error: 'この申請者は既に他のユニットに所属しています' });
    Object.assign(jr, { status: 'approved', decidedAt: now(), decidedBy: u.id });
    joinUnit(target, unit.id);
    notify(target.id, 'info', `「${unit.name}」への参加申請が承認されました。ようこそ！`, '/app', u.id);
  } else {
    Object.assign(jr, { status: 'cancelled', decidedAt: now(), decidedBy: u.id });
    save();
    notify(target.id, 'info', `「${unit.name}」への参加申請はキャンセルされました。別の所属ユニットを検索して、改めて申請してください。`, '/app', u.id);
  }
  changedUnit(unit.id, 'join-requests', 'team');
  changedUsers([target.id], 'join-requests', 'me');
  res.json(jr);
});

export default r;
