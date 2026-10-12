import { Router, type Request } from 'express';
import { db, now, save, timeJST, todayJST, uid, type User } from '../db';
import {
  canSchedule, canSeePatient, isAssigned, isManager, liveStatus, requireAuth, requireUnit, seesAll, visiblePatients, visibleVisits,
  type AuthedRequest,
} from '../auth';
import { activity, changedUnit, changedUsers, notify } from '../realtime';
import { mailConfigured, mailPatientVisit } from '../mail';
import type { Attachment, Conflict, DoctorSuggestion, Gender, Patient, Slot, Visit } from '../../../shared/types';
import { distanceKm } from '../../../shared/areas';
import { fromMin, hasStarted, overlaps, toMin } from '../../../shared/labels';

const r = Router();
r.use(requireAuth, requireUnit);
const me = (req: Request) => (req as AuthedRequest).user;
const member = (u: User, id: string, role?: User['role']) =>
  db.users.find((x) => x.id === id && x.unitId === u.unitId && (!role || x.role === role));
const title = (id: string) => {
  const x = db.users.find((y) => y.id === id);
  return x ? `${x.name}${x.role === 'doctor' ? '医師' : x.role === 'nurse' ? '看護師' : 'さん'}` : '';
};
const cleanAttachments = (a: unknown): Attachment[] =>
  Array.isArray(a)
    ? a.filter((x) => x && typeof x.url === 'string' && x.url.startsWith('/uploads/'))
        .map((x) => ({ name: String(x.name), url: x.url, type: String(x.type ?? ''), size: Number(x.size) || 0 }))
    : [];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// ---------- Patients ----------
r.get('/patients', (req, res) => res.json(visiblePatients(me(req))));

r.get('/patients/:id', (req, res) => {
  const u = me(req);
  const p = db.patients.find((x) => x.id === req.params.id);
  if (!p || !canSeePatient(u, p)) return res.status(404).json({ error: '患者が見つかりません' });
  res.json({
    patient: p,
    // Doctors/nurses only see their own visits, never ones assigned to someone else.
    visits: db.visits.filter((v) => v.patientId === p.id && (seesAll(u) || v.doctorId === u.id || v.nurseId === u.id)),
    updates: db.patientUpdates.filter((x) => x.patientId === p.id).reverse(),
    emails: db.emails.filter((x) => x.patientId === p.id).slice(-20).reverse(),
    mailConfigured: mailConfigured(),
  });
});

/** Nurses and administrators/proxies register patients. */
const canManagePatients = (u: User) => u.role === 'nurse' || u.role === 'admin' || isManager(u);

function patientFields(body: any) {
  const name = String(body?.name ?? '').trim();
  if (!name) return '患者氏名を入力してください';
  if (!['male', 'female'].includes(body?.gender)) return '性別を選択してください';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body?.birthDate ?? ''))) return '生年月日を入力してください';
  if (!String(body?.address ?? '').trim()) return '住所を入力してください';
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'メールアドレスを入力してください（訪問予定の通知に使用します）';
  return {
    name, kana: String(body.kana ?? '').trim(), gender: body.gender as Gender, birthDate: body.birthDate, email,
    address: String(body.address).trim(), area: String(body.area ?? ''), phone: String(body.phone ?? '').trim(),
    diagnosis: String(body.diagnosis ?? '').trim(), careLevel: String(body.careLevel ?? '').trim(), notes: String(body.notes ?? '').trim(),
  };
}

r.post('/patients', (req, res) => {
  const u = me(req);
  if (!canManagePatients(u)) return res.status(403).json({ error: '患者を追加する権限がありません' });
  const f = patientFields(req.body);
  if (typeof f === 'string') return res.status(400).json({ error: f });
  // Staff are assigned once at registration; a nurse registering a patient becomes their nurse.
  const doctor = member(u, String(req.body?.doctorId ?? ''), 'doctor');
  if (!doctor) return res.status(400).json({ error: '担当医師を選択してください' });
  const nurseId = u.role === 'nurse' ? u.id : String(req.body?.nurseId ?? '');
  if (!member(u, nurseId, 'nurse')) return res.status(400).json({ error: '担当看護師を選択してください' });
  const p: Patient = { id: uid(), unitId: u.unitId!, createdAt: now(), ...f, doctorIds: [doctor.id], nurseIds: [nurseId] };
  db.patients.push(p);
  save();
  for (const id of [doctor.id, nurseId]) if (id !== u.id) notify(id, 'info', `新しい担当患者 ${p.name}様が登録されました`, `patient:${p.id}`, u.id);
  activity(u.unitId!, 'patient_added', `${title(u.id)}が新規患者 ${p.name}様を登録しました`, u.id, [doctor.id, nurseId], p.id);
  changedUnit(u.unitId, 'patients');
  res.json(p);
});

r.put('/patients/:id', (req, res) => {
  const u = me(req);
  const p = db.patients.find((x) => x.id === req.params.id);
  if (!p || !canSeePatient(u, p)) return res.status(404).json({ error: '患者が見つかりません' });
  if (!canManagePatients(u)) return res.status(403).json({ error: '患者情報を編集する権限がありません' });
  const f = patientFields(req.body);
  if (typeof f === 'string') return res.status(400).json({ error: f });
  const doctor = member(u, String(req.body?.doctorId ?? p.doctorIds[0] ?? ''), 'doctor');
  const nurse = member(u, String(req.body?.nurseId ?? p.nurseIds[0] ?? ''), 'nurse');
  if (!doctor) return res.status(400).json({ error: '担当医師を選択してください' });
  if (!nurse) return res.status(400).json({ error: '担当看護師を選択してください' });
  const oldDoctor = p.doctorIds[0];
  const oldNurse = p.nurseIds[0];
  const removed = [...p.doctorIds, ...p.nurseIds].filter((id) => id !== doctor.id && id !== nurse.id);
  Object.assign(p, f, { doctorIds: [doctor.id], nurseIds: [nurse.id] });

  // Hand over upcoming visits to the new staff (cancelled if the new doctor/nurse is already booked).
  let moved = 0;
  let cancelled = 0;
  if (oldDoctor !== doctor.id || oldNurse !== nurse.id) {
    const today = todayJST();
    for (const v of db.visits.filter((x) => x.patientId === p.id && x.status === 'scheduled' && x.date >= today)) {
      const next = { doctorId: doctor.id, nurseId: nurse.id, date: v.date, startTime: v.startTime, endTime: v.endTime };
      if (conflictsFor(u.unitId!, next, v.id).length) {
        v.status = 'cancelled';
        cancelled++;
      } else {
        Object.assign(v, { doctorId: next.doctorId, nurseId: next.nurseId });
        moved++;
      }
    }
    removed.forEach((id) => notify(id, 'info', `${p.name}様の担当から外れました（担当変更）`, '', u.id));
    [doctor.id, nurse.id].filter((id) => id !== oldDoctor && id !== oldNurse && id !== u.id)
      .forEach((id) => notify(id, 'info', `${p.name}様の担当になりました`, `patient:${p.id}`, u.id));
    activity(u.unitId!, 'patient_update', `${title(u.id)}が${p.name}様の担当を${title(doctor.id)}・${title(nurse.id)}に変更しました`, u.id, [doctor.id, nurse.id], p.id);
  }
  save();
  changedUnit(u.unitId, 'patients', 'visits', `patient:${p.id}`);
  res.json({ ...p, moved, cancelled });
});

/** Condition updates / shared notes: only the patient's assigned doctor or nurse. */
r.post('/patients/:id/updates', (req, res) => {
  const u = me(req);
  const p = db.patients.find((x) => x.id === req.params.id);
  if (!p || !canSeePatient(u, p)) return res.status(404).json({ error: '患者が見つかりません' });
  if (!isAssigned(u, p)) return res.status(403).json({ error: '記録できるのはこの患者の担当医師・担当看護師のみです' });
  const content = String(req.body?.content ?? '').trim();
  const attachments = cleanAttachments(req.body?.attachments);
  if (!content && !attachments.length) return res.status(400).json({ error: '内容を入力してください' });
  const upd = { id: uid(), patientId: p.id, authorId: u.id, content, attachments, createdAt: now() };
  db.patientUpdates.push(upd);
  save();
  const related = [...p.nurseIds, ...p.doctorIds].filter((id) => id !== u.id);
  related.forEach((id) => notify(id, 'info', `${title(u.id)}が${p.name}様の状態を記録しました`, `patient:${p.id}`, u.id));
  activity(u.unitId!, 'patient_update', `${title(u.id)}が${p.name}様の状態を記録しました`, u.id, [...p.nurseIds, ...p.doctorIds], p.id);
  changedUnit(u.unitId, 'patients', `patient:${p.id}`);
  res.json(upd);
});

// ---------- Scheduling helpers ----------
function conflictsFor(unitId: string, v: Pick<Visit, 'doctorId' | 'nurseId' | 'date' | 'startTime' | 'endTime'>, excludeId?: string) {
  const out: Conflict[] = [];
  for (const o of db.visits) {
    if (o.unitId !== unitId || o.id === excludeId || o.status === 'cancelled' || o.date !== v.date) continue;
    if (!overlaps(v.startTime, v.endTime, o.startTime, o.endTime)) continue;
    if (o.doctorId === v.doctorId) out.push({ visit: o, who: 'doctor' });
    else if (v.nurseId && o.nurseId === v.nurseId) out.push({ visit: o, who: 'nurse' });
  }
  return out;
}

/** Free slots for a doctor (and nurse) on a date, in 15-minute steps between `from` and 20:00. */
function freeSlots(unitId: string, doctorId: string, date: string, duration: number, nurseId = '', excludeId?: string, from = '08:30'): Slot[] {
  const slots: Slot[] = [];
  const start = Math.ceil(toMin(from) / 15) * 15;
  for (let s = start; s + duration <= toMin('20:00'); s += 15) {
    const slot = { startTime: fromMin(s), endTime: fromMin(s + duration) };
    if (!conflictsFor(unitId, { doctorId, nurseId, date, ...slot }, excludeId).length) slots.push(slot);
  }
  return slots;
}

/** The free slot closest to the requested start time (what the AI auto-adjust picks). */
function nearestSlot(slots: Slot[], wanted: string) {
  return [...slots].sort((a, b) => Math.abs(toMin(a.startTime) - toMin(wanted)) - Math.abs(toMin(b.startTime) - toMin(wanted)) || toMin(a.startTime) - toMin(b.startTime))[0] ?? null;
}

function conflictInfo(u: User, v: any, conflicts: Conflict[], excludeId?: string) {
  const c = conflicts[0];
  const who = c.who === 'doctor' ? c.visit.doctorId : c.visit.nurseId;
  const duration = toMin(v.endTime) - toMin(v.startTime);
  const from = v.date === todayJST() ? timeJST() : '08:30';
  const slots = freeSlots(u.unitId!, v.doctorId, v.date, duration, v.nurseId, excludeId, from);
  return {
    error: `${title(who)}は ${c.visit.startTime}〜${c.visit.endTime} に既に予約が入っています。`,
    conflict: true,
    // Doctors/nurses only learn the busy time, not whose visit it is.
    conflicts: seesAll(u) ? conflicts : conflicts.map((x) => ({ who: x.who, visit: { startTime: x.visit.startTime, endTime: x.visit.endTime } })),
    autoSlot: nearestSlot(slots, v.startTime),
    suggestions: slots.slice(0, 6),
  };
}

/** Resolve doctor/nurse for a visit: the patient's attending doctor; the booking nurse accompanies. */
function prepareVisit(u: User, body: any) {
  const patient = db.patients.find((p) => p.id === body?.patientId && p.unitId === u.unitId);
  if (!patient || !canSeePatient(u, patient)) return '患者を選択してください';
  // An assistant doctor (応援医師) may be chosen when the attending doctor is already booked.
  const assistant = body?.assistantId ? member(u, String(body.assistantId), 'doctor') : undefined;
  if (body?.assistantId && !assistant) return '応援医師が見つかりません';
  const doctorId = assistant?.id ?? (patient.doctorIds.includes(body?.doctorId) ? body.doctorId : patient.doctorIds[0]);
  if (!doctorId) return 'この患者には担当医師が登録されていません';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body?.date ?? ''))) return '訪問日を入力してください';
  if (!/^\d{2}:\d{2}$/.test(String(body?.startTime)) || !/^\d{2}:\d{2}$/.test(String(body?.endTime))) return '時間を入力してください';
  if (toMin(body.endTime) <= toMin(body.startTime)) return '終了時刻は開始時刻より後にしてください';
  const nurseId = u.role === 'nurse' ? u.id : patient.nurseIds[0] ?? '';
  return { patient, doctorId, nurseId, assistant: !!assistant, date: body.date as string, startTime: body.startTime as string, endTime: body.endTime as string, purpose: String(body.purpose ?? '').trim() };
}

/**
 * The attending doctor is booked: the AI recommends assistant doctors who are free at that time,
 * closest to the patient's home first (then lightest workload that day).
 */
r.post('/visits/assistants', (req, res) => {
  const u = me(req);
  const v = prepareVisit(u, { ...req.body, assistantId: undefined });
  if (typeof v === 'string') return res.status(400).json({ error: v });
  if (v.nurseId && conflictsFor(u.unitId!, { ...v, doctorId: '' }).length) {
    return res.status(409).json({ error: 'あなた（看護師）はこの時間に別の訪問予定があります。時間を変更してください' });
  }
  const list = db.users
    .filter((d) => d.unitId === u.unitId && d.role === 'doctor' && d.id !== v.patient.doctorIds[0])
    .filter((d) => !conflictsFor(u.unitId!, { ...v, doctorId: d.id }).length)
    .map((d) => {
      const km = distanceKm(v.patient.area, d.area);
      const load = db.visits.filter((x) => x.doctorId === d.id && x.date === v.date && x.status !== 'cancelled').length;
      return { doctorId: d.id, distanceKm: km, dayLoad: load, reason: [km == null ? '距離不明' : `患者宅から約${km}km`, `${v.startTime}〜${v.endTime} 空きあり`, `当日の予定 ${load}件`].join(' / ') };
    })
    .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99) || a.dayLoad - b.dayLoad);
  res.json(list);
});

// ---------- Visits ----------
r.get('/visits', (req, res) => res.json(visibleVisits(me(req))));

/** Live availability check used while the form is filled in. */
r.post('/visits/check', (req, res) => {
  const u = me(req);
  const v = prepareVisit(u, req.body);
  if (typeof v === 'string') return res.json({ ok: true, conflicts: [] });
  const conflicts = conflictsFor(u.unitId!, v, req.body?.excludeId);
  if (!conflicts.length) return res.json({ ok: true, conflicts: [] });
  res.json({ ok: false, ...conflictInfo(u, v, conflicts, req.body?.excludeId) });
});

const notAllowed = (u: User) =>
  u.role === 'admin' ? '管理者は訪問予定の登録・編集はできません' : 'スケジュールを編集する権限がありません（閲覧のみ）';

r.post('/visits', (req, res) => {
  const u = me(req);
  if (!canSchedule(u)) return res.status(403).json({ error: notAllowed(u) });
  const v = prepareVisit(u, req.body);
  if (typeof v === 'string') return res.status(400).json({ error: v });
  const conflicts = conflictsFor(u.unitId!, v);
  if (conflicts.length) return res.status(409).json(conflictInfo(u, v, conflicts));
  const visit: Visit = {
    id: uid(), unitId: u.unitId!, patientId: v.patient.id, doctorId: v.doctorId, nurseId: v.nurseId, date: v.date,
    startTime: v.startTime, endTime: v.endTime, purpose: v.purpose || (v.assistant ? '緊急往診' : ''), urgent: v.assistant, approval: v.doctorId === u.id ? 'approved' : 'pending',
    approvedAt: v.doctorId === u.id ? now() : null, status: 'scheduled', report: '', attachments: [], completedAt: null, createdBy: u.id, createdAt: now(),
  };
  db.visits.push(visit);
  // The assistant doctor joins the care team so they can see the patient's record.
  if (v.assistant && !v.patient.doctorIds.includes(visit.doctorId)) v.patient.doctorIds.push(visit.doctorId);
  save();
  // The doctor must approve; everyone else related to the patient is informed.
  if (v.assistant) {
    notify(visit.doctorId, 'urgent', `【緊急患者】${md(visit.date)} ${visit.startTime}〜 ${v.patient.name}様（${v.patient.address}・${v.patient.diagnosis || '診断名未登録'}）の応援医師に指名されました。承認またはキャンセルしてください`, `visit:${visit.id}`, u.id);
  } else if (visit.approval === 'pending') {
    notify(visit.doctorId, 'visit', `【承認依頼】${md(visit.date)} ${visit.startTime}〜 ${v.patient.name}様の訪問予定が登録されました。承認してください`, `visit:${visit.id}`, u.id);
  }
  const related = [...new Set([visit.nurseId, ...v.patient.nurseIds])].filter((id) => id && id !== u.id);
  related.forEach((id) => notify(id, 'visit', `【訪問予定】${md(visit.date)} ${visit.startTime}〜 ${v.patient.name}様（${title(visit.doctorId)}・承認待ち）`, `visit:${visit.id}`, u.id));
  activity(u.unitId!, 'visit_created', `${title(u.id)}が${v.patient.name}様の訪問予定（${md(visit.date)} ${visit.startTime}・${title(visit.doctorId)}）を登録しました（医師の承認待ち）`, u.id, [visit.doctorId, visit.nurseId], v.patient.id);
  changedUnit(u.unitId, 'visits', 'patients', `patient:${v.patient.id}`);
  mailPatientVisit(v.patient, visit, v.assistant ? 'urgent' : 'created');
  res.json(visit);
});

r.put('/visits/:id', (req, res) => {
  const u = me(req);
  const visit = visibleVisits(u).find((x) => x.id === req.params.id);
  if (!visit) return res.status(404).json({ error: '訪問予定が見つかりません' });
  if (!canSchedule(u)) return res.status(403).json({ error: notAllowed(u) });
  if (visit.status !== 'scheduled') return res.status(400).json({ error: '開始済み・完了済みの訪問は編集できません' });
  const v = prepareVisit(u, { ...req.body, patientId: visit.patientId, doctorId: visit.doctorId });
  if (typeof v === 'string') return res.status(400).json({ error: v });
  v.nurseId = visit.nurseId || v.nurseId;
  const conflicts = conflictsFor(u.unitId!, v, visit.id);
  if (conflicts.length) return res.status(409).json(conflictInfo(u, v, conflicts, visit.id));
  const timeChanged = visit.date !== v.date || visit.startTime !== v.startTime || visit.endTime !== v.endTime;
  Object.assign(visit, { date: v.date, startTime: v.startTime, endTime: v.endTime, purpose: v.purpose });
  // A new date/time needs the doctor's approval again.
  if (timeChanged && visit.doctorId !== u.id) Object.assign(visit, { approval: 'pending', approvedAt: null });
  save();
  [visit.doctorId, visit.nurseId].filter((id) => id && id !== u.id).forEach((id) =>
    notify(id, 'visit', `【訪問予定変更】${md(visit.date)} ${visit.startTime}〜 ${v.patient.name}様${visit.approval === 'pending' && id === visit.doctorId ? '（再承認してください）' : ''}`, `visit:${visit.id}`, u.id));
  changedUnit(u.unitId, 'visits', `patient:${visit.patientId}`);
  mailPatientVisit(v.patient, visit, 'updated');
  res.json(visit);
});

r.post('/visits/:id/cancel', (req, res) => {
  const u = me(req);
  const v = visibleVisits(u).find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: '訪問予定が見つかりません' });
  if (!canSchedule(u)) return res.status(403).json({ error: notAllowed(u) });
  if (v.status === 'completed') return res.status(400).json({ error: '完了済みの訪問はキャンセルできません' });
  v.status = 'cancelled';
  save();
  const p = db.patients.find((x) => x.id === v.patientId);
  // The doctor, the nurses and the administrators are told about every cancellation.
  const admins = db.users.filter((x) => x.unitId === u.unitId && seesAll(x)).map((x) => x.id);
  [...new Set([v.doctorId, v.nurseId, ...(p?.nurseIds ?? []), ...admins])].filter((id) => id && id !== u.id).forEach((id) =>
    notify(id, 'visit', `【訪問キャンセル】${title(u.id)}が${md(v.date)} ${v.startTime}〜 ${p?.name}様の訪問をキャンセルしました`, `visit:${v.id}`, u.id));
  activity(u.unitId!, 'visit_cancelled', `${title(u.id)}が${p?.name}様の訪問（${md(v.date)} ${v.startTime}）をキャンセルしました`, u.id, [v.doctorId, v.nurseId], v.patientId);
  changedUnit(u.unitId, 'visits', 'team');
  res.json(v);
});

/** Admins and the booking nurse(s) are told when the doctor approves or declines. */
function informApproval(u: User, v: Visit, approved: boolean) {
  const p = db.patients.find((x) => x.id === v.patientId);
  const admins = db.users.filter((x) => x.unitId === u.unitId && seesAll(x) && x.id !== u.id).map((x) => x.id);
  const nurses = [v.nurseId, v.createdBy, ...(p?.nurseIds ?? [])].filter((id) => id && id !== u.id);
  const what = `${md(v.date)} ${v.startTime}〜 ${p?.name}様の${v.urgent ? '緊急往診' : '訪問'}`;
  const text = approved
    ? `${title(u.id)}が${what}を承認しました${v.urgent ? '（応援医師として緊急対応）' : ''}`
    : `${title(u.id)}が${what}を辞退しました。予定はキャンセルされました`;
  [...new Set([...nurses, ...admins])].forEach((id) => notify(id, v.urgent ? 'urgent' : 'visit', text, `visit:${v.id}`, u.id));
  activity(u.unitId!, approved ? 'visit_approved' : 'visit_declined', text, u.id, [v.doctorId, v.nurseId], v.patientId);
}

r.post('/visits/:id/:decision(approve|decline)', (req, res) => {
  const u = me(req);
  const v = visibleVisits(u).find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: '訪問予定が見つかりません' });
  if (v.doctorId !== u.id) return res.status(403).json({ error: '承認できるのは担当医師のみです' });
  if (v.approval !== 'pending' || v.status !== 'scheduled') return res.status(400).json({ error: 'この訪問は承認待ちではありません' });
  const approved = req.params.decision === 'approve';
  if (approved) Object.assign(v, { approval: 'approved', approvedAt: now() });
  else {
    Object.assign(v, { approval: 'declined', status: 'cancelled' });
    // An emergency doctor who declines leaves the patient's care team again.
    const p = db.patients.find((x) => x.id === v.patientId);
    if (p && v.urgent && p.doctorIds[0] !== u.id) p.doctorIds = p.doctorIds.filter((id) => id !== u.id);
  }
  save();
  informApproval(u, v, approved);
  changedUnit(u.unitId, 'visits', 'patients', `patient:${v.patientId}`);
  res.json(v);
});

/** The attending doctor uploads a report / images and marks the visit complete. */
r.post('/visits/:id/complete', (req, res) => {
  const u = me(req);
  const v = visibleVisits(u).find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: '訪問予定が見つかりません' });
  if (v.doctorId !== u.id) return res.status(403).json({ error: '担当医師のみ完了報告できます' });
  if (v.status === 'completed' || v.status === 'cancelled') return res.status(400).json({ error: 'この訪問は完了報告できません' });
  if (v.approval !== 'approved') return res.status(400).json({ error: '承認済みの訪問のみ記録できます' });
  if (!hasStarted(v, todayJST(), timeJST())) return res.status(400).json({ error: `訪問記録は予定時刻（${md(v.date)} ${v.startTime}）を過ぎてから登録できます` });
  const report = String(req.body?.report ?? '').trim();
  if (!report) return res.status(400).json({ error: '訪問レポートを入力してください' });
  Object.assign(v, { status: 'completed', report, attachments: cleanAttachments(req.body?.attachments), completedAt: now() });
  save();
  const p = db.patients.find((x) => x.id === v.patientId);
  const related = [...new Set([v.nurseId, ...(p?.nurseIds ?? []), ...(p?.doctorIds ?? [])])].filter((id) => id && id !== u.id);
  related.forEach((id) => notify(id, 'visit', `${title(u.id)}が${p?.name}様の訪問を完了しました`, `patient:${v.patientId}`, u.id));
  activity(u.unitId!, 'visit_completed', `${title(u.id)}が${p?.name}様の訪問を完了しました`, u.id, [v.doctorId, v.nurseId], v.patientId);
  changedUnit(u.unitId, 'visits', 'team', `patient:${v.patientId}`);
  res.json(v);
});

// ---------- Activity feed ----------
r.get('/activities', (req, res) => {
  const u = me(req);
  const mine = new Set(visiblePatients(u).map((p) => p.id));
  const list = db.activities.filter((a) => a.unitId === u.unitId &&
    (seesAll(u) || ((a.userIds.includes(u.id) || a.actorId === u.id) && (!a.patientId || mine.has(a.patientId)))));
  res.json(list.slice(-40).reverse());
});

export default r;
