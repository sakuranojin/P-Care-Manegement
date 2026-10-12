"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../auth");
const system_1 = require("../system");
const areas_1 = require("../../../shared/areas");
const labels_1 = require("../../../shared/labels");
/**
 * 患者履歴 + AI search agent (administrators only).
 * The agent interprets a Japanese free-text question into filters (dates, people, conditions, places,
 * phone numbers, status) and returns matching visits plus totals and a time series for charts.
 */
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth, auth_1.requireUnit);
const me = (req) => req.user;
r.use('/history', (req, res, next) => ((0, auth_1.seesAll)(me(req)) ? next() : res.status(403).json({ error: '患者履歴は管理者権限を持つユーザーのみ閲覧できます' })));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => ymd(new Date(parse(s).getTime() + n * 86400_000));
const digits = (s) => s.replace(/\D/g, '');
const fmt = (s) => s.replace(/-/g, '/');
function parseRange(q, today, preset) {
    const y = Number(today.slice(0, 4));
    const startOfWeek = (s) => addDays(s, -((parse(s).getUTCDay() + 6) % 7)); // Monday
    const month = (yy, mm, label) => {
        const from = `${yy}-${pad(mm)}-01`;
        const to = addDays(ymd(new Date(Date.UTC(yy, mm, 1))), -1);
        return { from, to, label: label ?? `${yy}年${mm}月` };
    };
    if (preset === 'week')
        return { from: addDays(today, -6), to: today, label: '直近1週間' };
    if (preset === 'month')
        return { from: addDays(today, -29), to: today, label: '直近1ヶ月' };
    if (preset === 'all')
        return null;
    let m = q.match(/(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})日?\s*(?:〜|~|～|-|ー|から)\s*(?:(\d{4})[\/\-年.])?(\d{1,2})[\/\-月.](\d{1,2})日?/);
    if (m) {
        const from = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
        const to = `${m[4] ?? m[1]}-${pad(+m[5])}-${pad(+m[6])}`;
        return { from, to, label: `${fmt(from)}〜${fmt(to)}` };
    }
    m = q.match(/(\d{1,2})月(\d{1,2})日\s*(?:〜|~|～|から)\s*(\d{1,2})月(\d{1,2})日/);
    if (m) {
        const from = `${y}-${pad(+m[1])}-${pad(+m[2])}`;
        const to = `${y}-${pad(+m[3])}-${pad(+m[4])}`;
        return { from, to, label: `${fmt(from)}〜${fmt(to)}` };
    }
    m = q.match(/(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/);
    if (m) {
        const d = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
        return { from: d, to: d, label: fmt(d) };
    }
    m = q.match(/(\d{1,2})月(\d{1,2})日/);
    if (m) {
        const d = `${y}-${pad(+m[1])}-${pad(+m[2])}`;
        return { from: d, to: d, label: fmt(d) };
    }
    m = q.match(/(\d{4})年(\d{1,2})月/);
    if (m)
        return month(+m[1], +m[2]);
    m = q.match(/(?<!\d)(\d{1,2})月(?!\d|日)/);
    if (m && +m[1] >= 1 && +m[1] <= 12)
        return month(y, +m[1]);
    if (/今日|本日/.test(q))
        return { from: today, to: today, label: '今日' };
    if (/昨日/.test(q))
        return { from: addDays(today, -1), to: addDays(today, -1), label: '昨日' };
    if (/明日/.test(q))
        return { from: addDays(today, 1), to: addDays(today, 1), label: '明日' };
    if (/先週/.test(q)) {
        const s = addDays(startOfWeek(today), -7);
        return { from: s, to: addDays(s, 6), label: '先週' };
    }
    if (/来週/.test(q)) {
        const s = addDays(startOfWeek(today), 7);
        return { from: s, to: addDays(s, 6), label: '来週' };
    }
    if (/今週/.test(q)) {
        const s = startOfWeek(today);
        return { from: s, to: addDays(s, 6), label: '今週' };
    }
    const mm = Number(today.slice(5, 7));
    if (/先月/.test(q))
        return mm === 1 ? month(y - 1, 12, '先月') : month(y, mm - 1, '先月');
    if (/来月/.test(q))
        return mm === 12 ? month(y + 1, 1, '来月') : month(y, mm + 1, '来月');
    if (/今月/.test(q))
        return month(y, mm, '今月');
    m = q.match(/(?:過去|直近|最近)?\s*(\d+)\s*日間?/);
    if (m && /過去|直近|最近|日間/.test(q))
        return { from: addDays(today, -(+m[1] - 1)), to: today, label: `直近${m[1]}日間` };
    if (/(1|一|１)\s*週間|週間/.test(q))
        return { from: addDays(today, -6), to: today, label: '直近1週間' };
    m = q.match(/(\d+|一|ひと)\s*[ヶかカケ]?月/);
    if (m && /[ヶかカケ]月|ひと月/.test(q)) {
        const n = /\d/.test(m[1]) ? +m[1] : 1;
        return { from: addDays(today, -(30 * n - 1)), to: today, label: `直近${n}ヶ月` };
    }
    return null; // 全期間
}
function interpret(u, raw, preset) {
    const q = raw.normalize('NFKC').trim();
    const today = (0, db_1.todayJST)();
    const now = (0, db_1.timeJST)();
    const chips = [];
    const range = parseRange(q, today, preset);
    chips.push({ label: '期間', value: range ? `${range.label}（${fmt(range.from)}〜${fmt(range.to)}）` : '全期間' });
    const patients = db_1.db.patients.filter((p) => p.unitId === u.unitId);
    const staff = db_1.db.users.filter((x) => x.unitId === u.unitId && x.role !== 'admin');
    const squash = (s) => s.replace(/[\s　]/g, '');
    const qs = squash(q);
    const used = [];
    // People: full names, kana, or surname followed by 様 / 医師 / 先生 / 看護師 / さん.
    const patientIds = new Set();
    for (const p of patients) {
        const sur = p.name.split(/[\s　]/)[0];
        if (qs.includes(squash(p.name)) || (p.kana && qs.includes(squash(p.kana))) || qs.includes(`${sur}様`) || qs.includes(`${sur}さま`)) {
            patientIds.add(p.id);
            used.push(squash(p.name), sur);
        }
    }
    const doctorIds = new Set();
    const nurseIds = new Set();
    for (const s of staff) {
        const sur = s.name.split(/[\s　]/)[0];
        const hit = qs.includes(squash(s.name)) || new RegExp(`${sur}(医師|先生|ドクター|Dr|看護師|ナース|さん)`).test(qs);
        if (hit) {
            (s.role === 'doctor' ? doctorIds : nurseIds).add(s.id);
            used.push(squash(s.name), sur);
        }
    }
    if (patientIds.size)
        chips.push({ label: '患者', value: [...patientIds].map((id) => patients.find((p) => p.id === id).name).join('、') });
    if (doctorIds.size)
        chips.push({ label: '担当医師', value: [...doctorIds].map((id) => staff.find((x) => x.id === id).name).join('、') });
    if (nurseIds.size)
        chips.push({ label: '担当看護師', value: [...nurseIds].map((id) => staff.find((x) => x.id === id).name).join('、') });
    // Medical conditions: vocabulary built from the unit's diagnoses (plus common synonyms).
    const synonyms = { がん: ['癌', 'ガン', '腫瘍'], 認知症: ['アルツハイマー'], 糖尿病: ['DM'], 心不全: ['心臓'], COPD: ['肺気腫', '呼吸器'], 脳梗塞: ['脳卒中', '片麻痺'] };
    const conditionIds = new Set();
    const conditionWords = new Set();
    for (const p of patients) {
        const tokens = [p.diagnosis, ...p.diagnosis.split(/[（）()・、\s]/)].filter((t) => t.length >= 2);
        for (const t of tokens) {
            const keys = [t, ...Object.entries(synonyms).filter(([k]) => t.includes(k)).flatMap(([k, v]) => [k, ...v])];
            const hit = keys.find((k) => k.length >= 2 && q.toUpperCase().includes(k.toUpperCase()));
            if (hit) {
                conditionIds.add(p.id);
                conditionWords.add(hit);
            }
        }
    }
    if (conditionIds.size)
        chips.push({ label: '病状', value: [...conditionWords].join('、') });
    // Places: ward/city names, or any other word found in a patient's address.
    const locationIds = new Set();
    const places = new Set();
    for (const a of areas_1.AREAS) {
        const short = a.name.replace(/^(東京都|神奈川県|埼玉県|千葉県)/, '');
        const bare = short.replace(/[区市]$/, '');
        if (q.includes(short) || (bare.length >= 2 && q.includes(bare))) {
            patients.filter((p) => p.area === a.id || p.address.includes(bare)).forEach((p) => locationIds.add(p.id));
            places.add(short);
        }
    }
    const words = q.split(/[\s　、,。・の]+/).filter((w) => w.length >= 2 && !/\d/.test(w));
    for (const w of words) {
        if (places.size || used.some((x) => w.includes(x)))
            continue;
        const hits = patients.filter((p) => p.address.includes(w));
        if (hits.length && hits.length < patients.length) {
            hits.forEach((p) => locationIds.add(p.id));
            places.add(w);
        }
    }
    if (places.size)
        chips.push({ label: '地域', value: [...places].join('、') });
    // Phone numbers (patient or staff), matched on digits only.
    const phoneDigits = (q.match(/[\d-]{4,}/g) ?? []).map(digits).filter((d) => d.length >= 4 && !/^20\d{2}$/.test(d));
    const phonePatients = new Set();
    const phoneStaff = new Set();
    for (const d of phoneDigits) {
        patients.filter((p) => digits(p.phone).includes(d)).forEach((p) => phonePatients.add(p.id));
        staff.filter((s) => digits(s.phone).includes(d)).forEach((s) => phoneStaff.add(s.id));
    }
    if (phoneDigits.length)
        chips.push({ label: '電話番号', value: phoneDigits.join('、') + (phonePatients.size + phoneStaff.size ? '' : '（該当なし）') });
    let status = null;
    if (/未報告|未記録|保留|ペンディング|報告待ち/.test(q))
        status = 'pending_report';
    else if (/完了|済み|実施済/.test(q))
        status = 'completed';
    else if (/キャンセル|中止/.test(q))
        status = 'cancelled';
    else if (/予定|今後|これから/.test(q))
        status = 'scheduled';
    const urgentOnly = /緊急/.test(q);
    const approvalPending = /承認待ち|未承認/.test(q);
    const statusName = { completed: '完了', pending_report: '未報告', cancelled: 'キャンセル', scheduled: '予定', in_progress: '訪問中' };
    if (status)
        chips.push({ label: '状態', value: statusName[status] });
    if (urgentOnly)
        chips.push({ label: '種別', value: '緊急往診' });
    if (approvalPending)
        chips.push({ label: '承認', value: '承認待ち' });
    const wantsChart = /グラフ|チャート|集計|推移|統計|件数|分析/.test(q) || !!preset;
    // Apply filters.
    const recognised = patientIds.size + doctorIds.size + nurseIds.size + conditionIds.size + locationIds.size + phoneDigits.length;
    let base = db_1.db.visits.filter((v) => v.unitId === u.unitId);
    if (range)
        base = base.filter((v) => v.date >= range.from && v.date <= range.to);
    if (patientIds.size)
        base = base.filter((v) => patientIds.has(v.patientId));
    if (doctorIds.size)
        base = base.filter((v) => doctorIds.has(v.doctorId));
    if (nurseIds.size)
        base = base.filter((v) => nurseIds.has(v.nurseId));
    if (conditionIds.size)
        base = base.filter((v) => conditionIds.has(v.patientId));
    if (locationIds.size)
        base = base.filter((v) => locationIds.has(v.patientId));
    if (phoneDigits.length)
        base = base.filter((v) => phonePatients.has(v.patientId) || phoneStaff.has(v.doctorId) || phoneStaff.has(v.nurseId));
    if (urgentOnly)
        base = base.filter((v) => v.urgent);
    if (approvalPending)
        base = base.filter((v) => v.approval === 'pending' && v.status === 'scheduled');
    // Free-text fallback over names, addresses, diagnoses and reports when nothing else was recognised.
    const leftovers = words.filter((w) => !/期間|全期間|グラフ|チャート|集計|推移|訪問|予定|完了|未報告|件数|一覧|患者|医師|看護師|表示|検索|すべて|全て|今週|先週|今月|先月|今日|昨日|直近|過去|週間|ヶ月|か月|緊急|承認/.test(w));
    if (!recognised && leftovers.length) {
        const text = (v) => {
            const p = db_1.db.patients.find((x) => x.id === v.patientId);
            return [p?.name, p?.kana, p?.address, p?.diagnosis, p?.notes, v.purpose, v.report].join(' ');
        };
        base = base.filter((v) => leftovers.every((w) => text(v).includes(w)));
        chips.push({ label: 'キーワード', value: leftovers.join('、') });
    }
    const withStatus = base.map((v) => ({ ...v, display: (0, labels_1.displayStatus)(v, today, now) }));
    const counted = withStatus.filter((v) => v.status !== 'cancelled');
    const stats = {
        total: counted.length,
        completed: counted.filter((v) => v.display === 'completed').length,
        pending: counted.filter((v) => v.display === 'pending_report').length,
        scheduled: counted.filter((v) => v.display === 'scheduled' || v.display === 'in_progress').length,
        cancelled: withStatus.length - counted.length,
    };
    // Time series for the chart: daily (≤ 2 weeks), weekly (≤ 4 months) or monthly.
    const dates = counted.map((v) => v.date).sort();
    const from = range?.from ?? dates[0] ?? today;
    const to = range?.to ?? dates[dates.length - 1] ?? today;
    const days = Math.round((parse(to).getTime() - parse(from).getTime()) / 86400_000) + 1;
    const unit = days <= 14 ? 'day' : days <= 120 ? 'week' : 'month';
    const bucket = (d) => unit === 'day' ? d : unit === 'week' ? addDays(d, -((parse(d).getUTCDay() + 6) % 7)) : d.slice(0, 7);
    const keys = [];
    for (let d = unit === 'week' ? bucket(from) : from; d <= to; d = addDays(d, unit === 'week' ? 7 : 1)) {
        const k = unit === 'month' ? d.slice(0, 7) : d;
        if (!keys.includes(k))
            keys.push(k);
        if (keys.length > 60)
            break;
    }
    const series = keys.map((k) => {
        const items = counted.filter((v) => bucket(v.date) === k);
        const label = unit === 'month' ? `${Number(k.slice(5))}月` : `${Number(k.slice(5, 7))}/${Number(k.slice(8))}${unit === 'week' ? '週' : ''}`;
        return {
            key: k, label,
            completed: items.filter((v) => v.display === 'completed').length,
            pending: items.filter((v) => v.display === 'pending_report').length,
            scheduled: items.filter((v) => v.display === 'scheduled' || v.display === 'in_progress').length,
        };
    });
    const listed = (status ? withStatus.filter((v) => v.display === status || (status === 'scheduled' && v.display === 'in_progress')) : withStatus.filter((v) => v.status !== 'cancelled'))
        .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    const answer = `${chips.filter((c) => c.label !== '期間').map((c) => `${c.label}「${c.value}」`).join('・') || '条件なし'}で${range ? range.label : '全期間'}の訪問を検索しました。` +
        `該当 ${stats.total}件（完了 ${stats.completed}件・未報告 ${stats.pending}件・予定 ${stats.scheduled}件）。`;
    return { query: raw, chips, range, stats, series, unit, wantsChart, visits: listed.slice(0, 300), totalListed: listed.length, answer };
}
r.post('/history/ask', (req, res) => res.json(interpret(me(req), String(req.body?.q ?? ''), req.body?.preset)));
/** Manually trigger the 17:00 system report (for demonstrations). */
r.post('/history/daily-report', (req, res) => res.json({ sent: (0, system_1.sendDailyReport)() }));
exports.default = r;
