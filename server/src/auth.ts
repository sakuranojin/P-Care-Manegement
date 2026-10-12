import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { DATA_DIR, db, timeJST, todayJST, type User } from './db';
import { isOnline } from './presence';
import type { Patient, PublicUser, StaffStatus, Visit } from '../../shared/types';

/** Use JWT_SECRET if set; otherwise generate one once and keep it in the data directory. */
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt_secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(file, s);
    return s;
  }
}
const SECRET = loadSecret();

export const sign = (id: string) => jwt.sign({ sub: id }, SECRET, { expiresIn: '14d' });

export function userFromToken(token?: string): User | undefined {
  if (!token) return;
  try {
    const { sub } = jwt.verify(token, SECRET) as { sub: string };
    return db.users.find((u) => u.id === sub);
  } catch {
    return;
  }
}

export type AuthedRequest = Request & { user: User };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = userFromToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!user) return res.status(401).json({ error: 'ログインが必要です' });
  (req as AuthedRequest).user = user;
  next();
}

/** Only members of a unit can see unit data; new sign-ups have no access until invited. */
export function requireUnit(req: Request, res: Response, next: NextFunction) {
  const u = (req as AuthedRequest).user;
  if (!u.profileCompleted) return res.status(403).json({ error: 'プロフィール登録を完了してください' });
  if (!u.unitId) return res.status(403).json({ error: '所属ユニットへの参加が必要です' });
  next();
}

type AnyUser = User | PublicUser;
/** Owner and proxies (代理) have administrator capabilities. */
export const isManager = (u: AnyUser) => u.permission === 'owner' || u.permission === 'manager';
export const canEditSchedule = (u: AnyUser) => isManager(u) || u.permission === 'schedule_edit';
/** Administrators never enter or edit visit appointments; doctors/nurses with edit rights do. */
export const canSchedule = (u: AnyUser) => u.role !== 'admin' && canEditSchedule(u);
/** Administrators and proxies see all unit data; doctors and nurses only see their own. */
export const seesAll = (u: AnyUser) => isManager(u) || u.role === 'admin';

/** Automatic status: on a visit → 訪問中, logged in → 待機中 (admins may choose 取込中), otherwise 退勤. */
export function liveStatus(u: User): StaffStatus {
  // 訪問中 only while an in-progress visit's scheduled time window is current.
  const today = todayJST();
  const t = timeJST();
  if (u.role !== 'admin' && db.visits.some((v) => v.status === 'in_progress' && (v.doctorId === u.id || v.nurseId === u.id) && v.date === today && t < v.endTime)) return 'visiting';
  if (!isOnline(u.id)) return 'off';
  return u.role === 'admin' && u.manualStatus === 'busy' ? 'busy' : 'waiting';
}

export function pub(u: User): PublicUser {
  const { passwordHash: _p, manualStatus: _m, ...rest } = u;
  return { ...rest, status: liveStatus(u), online: isOnline(u.id) };
}

/** Assigned as the patient's attending doctor or nurse. */
export const isAssigned = (u: User, p: Patient) => p.nurseIds.includes(u.id) || p.doctorIds.includes(u.id);

/**
 * Doctors and nurses only see patients they are currently assigned to. When the attending
 * staff is changed, the previous doctor/nurse immediately loses access to that patient.
 */
export function canSeePatient(u: User, p: Patient) {
  return p.unitId === u.unitId && (seesAll(u) || isAssigned(u, p));
}

export function visiblePatients(u: User): Patient[] {
  return db.patients.filter((p) => canSeePatient(u, p));
}

/** Calendar: admins see everything; staff see their own visits for patients still assigned to them. */
export function visibleVisits(u: User): Visit[] {
  const all = db.visits.filter((v) => v.unitId === u.unitId);
  if (seesAll(u)) return all;
  const mine = new Set(visiblePatients(u).map((p) => p.id));
  return all.filter((v) => (v.doctorId === u.id || v.nurseId === u.id) && mine.has(v.patientId));
}
