"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.overlaps = exports.fromMin = exports.toMin = exports.hasStarted = exports.displayStatusLabel = exports.visitStatusLabel = exports.statusLabel = exports.permissionLabel = exports.genderLabel = exports.roleLabel = void 0;
exports.displayStatus = displayStatus;
exports.ageOf = ageOf;
exports.roleLabel = { admin: '管理者', nurse: '看護師', doctor: '医師' };
exports.genderLabel = { male: '男性', female: '女性', other: 'その他' };
exports.permissionLabel = {
    owner: 'ユニット作成者',
    manager: '代理（管理者代行）',
    schedule_edit: 'スケジュール編集',
    read_only: '閲覧のみ',
};
exports.statusLabel = { waiting: '待機中', visiting: '訪問中', off: '退勤', busy: '取込中' };
exports.visitStatusLabel = {
    scheduled: '予定',
    in_progress: '訪問中',
    completed: '完了',
    cancelled: 'キャンセル',
};
exports.displayStatusLabel = { ...exports.visitStatusLabel, pending_report: '未報告' };
function displayStatus(v, today, now) {
    if ((v.status === 'scheduled' || v.status === 'in_progress') && (v.date < today || (v.date === today && v.endTime <= now)))
        return 'pending_report';
    return v.status;
}
/** The visit's start time has been reached (start / report are allowed from then on). */
const hasStarted = (v, today, now) => v.date < today || (v.date === today && v.startTime <= now);
exports.hasStarted = hasStarted;
function ageOf(birthDate, today = new Date()) {
    if (!birthDate)
        return null;
    const b = new Date(birthDate);
    if (isNaN(b.getTime()))
        return null;
    let age = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate()))
        age--;
    return age;
}
const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};
exports.toMin = toMin;
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
exports.fromMin = fromMin;
const overlaps = (aS, aE, bS, bE) => (0, exports.toMin)(aS) < (0, exports.toMin)(bE) && (0, exports.toMin)(bS) < (0, exports.toMin)(aE);
exports.overlaps = overlaps;
