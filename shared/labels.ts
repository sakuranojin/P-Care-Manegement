import type { Gender, Permission, Role, StaffStatus, VisitStatus } from './types';

export const roleLabel: Record<Role, string> = { admin: '管理者', nurse: '看護師', doctor: '医師' };
export const genderLabel: Record<Gender, string> = { male: '男性', female: '女性', other: 'その他' };
export const permissionLabel: Record<Permission, string> = {
  owner: 'ユニット作成者',
  manager: '代理（管理者代行）',
  schedule_edit: 'スケジュール編集',
  read_only: '閲覧のみ',
};
export const statusLabel: Record<StaffStatus, string> = { waiting: '待機中', visiting: '訪問中', off: '退勤', busy: '取込中' };
export const visitStatusLabel: Record<VisitStatus, string> = {
  scheduled: '予定',
  in_progress: '訪問中',
  completed: '完了',
  cancelled: 'キャンセル',
};

/** Display status: a visit whose time has ended without a report is 未報告 (pending report). */
export type DisplayStatus = VisitStatus | 'pending_report';
export const displayStatusLabel: Record<DisplayStatus, string> = { ...visitStatusLabel, pending_report: '未報告' };
export function displayStatus(v: { status: VisitStatus; date: string; endTime: string }, today: string, now: string): DisplayStatus {
  if ((v.status === 'scheduled' || v.status === 'in_progress') && (v.date < today || (v.date === today && v.endTime <= now))) return 'pending_report';
  return v.status;
}
/** The visit's start time has been reached (start / report are allowed from then on). */
export const hasStarted = (v: { date: string; startTime: string }, today: string, now: string) =>
  v.date < today || (v.date === today && v.startTime <= now);

export function ageOf(birthDate: string, today = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export const overlaps = (aS: string, aE: string, bS: string, bE: string) => toMin(aS) < toMin(bE) && toMin(bS) < toMin(aE);
