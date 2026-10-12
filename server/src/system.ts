import { db, save, timeJST, todayJST } from './db';
import { seesAll } from './auth';
import { activity, changedUnit, notify } from './realtime';
import { displayStatus } from '../../shared/labels';
import type { Visit } from '../../shared/types';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** Visits whose time has ended but that still have no report (未報告). */
export function pendingReports(unitId: string): Visit[] {
  const today = todayJST();
  const t = timeJST();
  return db.visits
    .filter((v) => v.unitId === unitId && displayStatus(v, today, t) === 'pending_report')
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

/**
 * 17:00 daily system notification: each doctor gets their unreported visits with a request to report;
 * administrators get the unit-wide summary.
 */
export function sendDailyReport() {
  let sent = 0;
  for (const unit of db.units) {
    const pending = pendingReports(unit.id);
    if (!pending.length) continue;
    const byDoctor = new Map<string, Visit[]>();
    pending.forEach((v) => byDoctor.set(v.doctorId, [...(byDoctor.get(v.doctorId) ?? []), v]));
    const name = (id: string) => db.users.find((u) => u.id === id)?.name ?? '';
    const patient = (id: string) => db.patients.find((p) => p.id === id)?.name ?? '';
    for (const [doctorId, list] of byDoctor) {
      const lines = list.slice(0, 8).map((v) => `・${md(v.date)} ${v.startTime}〜 ${patient(v.patientId)}様`);
      if (list.length > 8) lines.push(`ほか ${list.length - 8}件`);
      notify(doctorId, 'info', `【システム通知】未報告の訪問が${list.length}件あります。訪問記録（レポート）の登録をお願いします。\n${lines.join('\n')}`, '/app', 'system');
      sent++;
    }
    const summary = [...byDoctor].map(([id, l]) => `${name(id)}医師 ${l.length}件`).join('、');
    db.users
      .filter((u) => u.unitId === unit.id && seesAll(u))
      .forEach((u) => {
        notify(u.id, 'info', `【システム通知】本日17時時点の未報告の訪問は合計${pending.length}件です（${summary}）。各医師に報告を依頼しました。`, '/app', 'system');
        sent++;
      });
  }
  return sent;
}

/** Approved visits switch to 訪問中 automatically when their scheduled start time arrives. */
export function autoStartVisits() {
  const today = todayJST();
  const t = timeJST();
  const started = db.visits.filter((v) => v.status === 'scheduled' && v.approval === 'approved' && v.date === today && v.startTime <= t && t < v.endTime);
  for (const v of started) {
    v.status = 'in_progress';
    const p = db.patients.find((x) => x.id === v.patientId);
    const doctor = db.users.find((u) => u.id === v.doctorId);
    activity(v.unitId, 'visit_started', `${p?.name}様の訪問（${v.startTime}〜・${doctor?.name ?? ''}医師）が開始時刻になり「訪問中」になりました`, 'system', [v.doctorId, v.nurseId], v.patientId);
  }
  if (started.length) {
    save();
    new Set(started.map((v) => v.unitId)).forEach((id) => changedUnit(id, 'visits', 'team'));
  }
  return started.length;
}

/** Check every minute: start due visits, and send the report reminder once a day during the 17:00 hour (Japan time). */
export function startScheduler() {
  const tick = () => {
    autoStartVisits();
    const today = todayJST();
    if (timeJST().startsWith('17:') && db.meta.lastDailyReport !== today) {
      db.meta.lastDailyReport = today;
      save();
      const n = sendDailyReport();
      console.log(`[system] 17:00 daily report sent (${n} notifications)`);
    }
  };
  tick();
  setInterval(tick, 60_000);
}
