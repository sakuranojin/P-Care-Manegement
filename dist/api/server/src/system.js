"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingReports = pendingReports;
exports.sendDailyReport = sendDailyReport;
exports.autoStartVisits = autoStartVisits;
exports.startScheduler = startScheduler;
const db_1 = require("./db");
const auth_1 = require("./auth");
const realtime_1 = require("./realtime");
const labels_1 = require("../../shared/labels");
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
/** Visits whose time has ended but that still have no report (未報告). */
function pendingReports(unitId) {
    const today = (0, db_1.todayJST)();
    const t = (0, db_1.timeJST)();
    return db_1.db.visits
        .filter((v) => v.unitId === unitId && (0, labels_1.displayStatus)(v, today, t) === 'pending_report')
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
/**
 * 17:00 daily system notification: each doctor gets their unreported visits with a request to report;
 * administrators get the unit-wide summary.
 */
function sendDailyReport() {
    let sent = 0;
    for (const unit of db_1.db.units) {
        const pending = pendingReports(unit.id);
        if (!pending.length)
            continue;
        const byDoctor = new Map();
        pending.forEach((v) => byDoctor.set(v.doctorId, [...(byDoctor.get(v.doctorId) ?? []), v]));
        const name = (id) => db_1.db.users.find((u) => u.id === id)?.name ?? '';
        const patient = (id) => db_1.db.patients.find((p) => p.id === id)?.name ?? '';
        for (const [doctorId, list] of byDoctor) {
            const lines = list.slice(0, 8).map((v) => `・${md(v.date)} ${v.startTime}〜 ${patient(v.patientId)}様`);
            if (list.length > 8)
                lines.push(`ほか ${list.length - 8}件`);
            (0, realtime_1.notify)(doctorId, 'info', `【システム通知】未報告の訪問が${list.length}件あります。訪問記録（レポート）の登録をお願いします。\n${lines.join('\n')}`, '/app', 'system');
            sent++;
        }
        const summary = [...byDoctor].map(([id, l]) => `${name(id)}医師 ${l.length}件`).join('、');
        db_1.db.users
            .filter((u) => u.unitId === unit.id && (0, auth_1.seesAll)(u))
            .forEach((u) => {
            (0, realtime_1.notify)(u.id, 'info', `【システム通知】本日17時時点の未報告の訪問は合計${pending.length}件です（${summary}）。各医師に報告を依頼しました。`, '/app', 'system');
            sent++;
        });
    }
    return sent;
}
/** Approved visits switch to 訪問中 automatically when their scheduled start time arrives. */
function autoStartVisits() {
    const today = (0, db_1.todayJST)();
    const t = (0, db_1.timeJST)();
    const started = db_1.db.visits.filter((v) => v.status === 'scheduled' && v.approval === 'approved' && v.date === today && v.startTime <= t && t < v.endTime);
    for (const v of started) {
        v.status = 'in_progress';
        const p = db_1.db.patients.find((x) => x.id === v.patientId);
        const doctor = db_1.db.users.find((u) => u.id === v.doctorId);
        (0, realtime_1.activity)(v.unitId, 'visit_started', `${p?.name}様の訪問（${v.startTime}〜・${doctor?.name ?? ''}医師）が開始時刻になり「訪問中」になりました`, 'system', [v.doctorId, v.nurseId], v.patientId);
    }
    if (started.length) {
        (0, db_1.save)();
        new Set(started.map((v) => v.unitId)).forEach((id) => (0, realtime_1.changedUnit)(id, 'visits', 'team'));
    }
    return started.length;
}
/** Check every minute: start due visits, and send the report reminder once a day during the 17:00 hour (Japan time). */
function startScheduler() {
    const tick = () => {
        autoStartVisits();
        const today = (0, db_1.todayJST)();
        if ((0, db_1.timeJST)().startsWith('17:') && db_1.db.meta.lastDailyReport !== today) {
            db_1.db.meta.lastDailyReport = today;
            (0, db_1.save)();
            const n = sendDailyReport();
            console.log(`[system] 17:00 daily report sent (${n} notifications)`);
        }
    };
    tick();
    setInterval(tick, 60_000);
}
