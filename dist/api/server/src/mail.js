"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mailConfigured = void 0;
exports.sendMail = sendMail;
exports.mailPatientVisit = mailPatientVisit;
const nodemailer_1 = __importDefault(require("nodemailer"));
const db_1 = require("./db");
/** SMTP is optional: without it, emails are kept in the outbox with status "not_configured". */
const transport = process.env.SMTP_HOST
    ? nodemailer_1.default.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
    : undefined;
const mailConfigured = () => !!transport;
exports.mailConfigured = mailConfigured;
async function sendMail(to, subject, text) {
    if (!transport) {
        console.log(`[mail:not-configured] to=${to} subject=${subject}`);
        return 'not_configured';
    }
    try {
        await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
        return 'sent';
    }
    catch (e) {
        console.error('メール送信に失敗しました', e);
        return 'failed';
    }
}
const jpDate = (d) => {
    const dt = new Date(d + 'T00:00:00');
    return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日（${'日月火水木金土'[dt.getDay()]}）`;
};
/** Tell the patient the visit time and attending doctor when a visit is added or changed. */
async function mailPatientVisit(p, v, kind) {
    if (!p.email)
        return;
    const unit = db_1.db.units.find((u) => u.id === p.unitId);
    const doctor = db_1.db.users.find((u) => u.id === v.doctorId);
    const subject = {
        created: '【訪問予定のお知らせ】',
        updated: '【訪問予定変更のお知らせ】',
        urgent: '【緊急往診のお知らせ】',
    }[kind] + (unit?.name ?? 'P-CARE-MANAGEMENT');
    const body = [
        `${p.name} 様`,
        '',
        kind === 'updated' ? '訪問予定が変更になりましたのでお知らせいたします。' : '下記の日時に訪問いたします。',
        '',
        `■ 訪問日時：${jpDate(v.date)} ${v.startTime}〜${v.endTime}`,
        `■ 担当医師：${doctor?.name ?? '—'}`,
        `■ 訪問内容：${v.purpose || '訪問診療'}`,
        '',
        'ご都合が悪い場合は、お手数ですが下記までご連絡ください。',
        '',
        unit ? `${unit.name}\n${unit.address}` : '',
        '',
        '※本メールは P-CARE-MANAGEMENT から自動送信されています。',
    ].join('\n');
    const log = { id: (0, db_1.uid)(), unitId: p.unitId, patientId: p.id, to: p.email, subject, body, status: 'not_configured', createdAt: (0, db_1.now)() };
    db_1.db.emails.push(log);
    (0, db_1.save)();
    log.status = await sendMail(p.email, subject, body);
    (0, db_1.save)();
}
