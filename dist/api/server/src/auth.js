"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAssigned = exports.seesAll = exports.canSchedule = exports.canEditSchedule = exports.isManager = exports.sign = void 0;
exports.userFromToken = userFromToken;
exports.requireAuth = requireAuth;
exports.requireUnit = requireUnit;
exports.liveStatus = liveStatus;
exports.pub = pub;
exports.canSeePatient = canSeePatient;
exports.visiblePatients = visiblePatients;
exports.visibleVisits = visibleVisits;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("./db");
const presence_1 = require("./presence");
/** Use JWT_SECRET if set; otherwise generate one once and keep it in the data directory. */
function loadSecret() {
    if (process.env.JWT_SECRET)
        return process.env.JWT_SECRET;
    const file = path_1.default.join(db_1.DATA_DIR, '.jwt_secret');
    try {
        return fs_1.default.readFileSync(file, 'utf8').trim();
    }
    catch {
        const s = crypto_1.default.randomBytes(48).toString('hex');
        fs_1.default.writeFileSync(file, s);
        return s;
    }
}
const SECRET = loadSecret();
const sign = (id) => jsonwebtoken_1.default.sign({ sub: id }, SECRET, { expiresIn: '14d' });
exports.sign = sign;
function userFromToken(token) {
    if (!token)
        return;
    try {
        const { sub } = jsonwebtoken_1.default.verify(token, SECRET);
        return db_1.db.users.find((u) => u.id === sub);
    }
    catch {
        return;
    }
}
function requireAuth(req, res, next) {
    const user = userFromToken(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!user)
        return res.status(401).json({ error: 'ログインが必要です' });
    req.user = user;
    next();
}
/** Only members of a unit can see unit data; new sign-ups have no access until invited. */
function requireUnit(req, res, next) {
    const u = req.user;
    if (!u.profileCompleted)
        return res.status(403).json({ error: 'プロフィール登録を完了してください' });
    if (!u.unitId)
        return res.status(403).json({ error: '所属ユニットへの参加が必要です' });
    next();
}
/** Owner and proxies (代理) have administrator capabilities. */
const isManager = (u) => u.permission === 'owner' || u.permission === 'manager';
exports.isManager = isManager;
const canEditSchedule = (u) => (0, exports.isManager)(u) || u.permission === 'schedule_edit';
exports.canEditSchedule = canEditSchedule;
/** Administrators never enter or edit visit appointments; doctors/nurses with edit rights do. */
const canSchedule = (u) => u.role !== 'admin' && (0, exports.canEditSchedule)(u);
exports.canSchedule = canSchedule;
/** Administrators and proxies see all unit data; doctors and nurses only see their own. */
const seesAll = (u) => (0, exports.isManager)(u) || u.role === 'admin';
exports.seesAll = seesAll;
/** Automatic status: on a visit → 訪問中, logged in → 待機中 (admins may choose 取込中), otherwise 退勤. */
function liveStatus(u) {
    // 訪問中 only while an in-progress visit's scheduled time window is current.
    const today = (0, db_1.todayJST)();
    const t = (0, db_1.timeJST)();
    if (u.role !== 'admin' && db_1.db.visits.some((v) => v.status === 'in_progress' && (v.doctorId === u.id || v.nurseId === u.id) && v.date === today && t < v.endTime))
        return 'visiting';
    if (!(0, presence_1.isOnline)(u.id))
        return 'off';
    return u.role === 'admin' && u.manualStatus === 'busy' ? 'busy' : 'waiting';
}
function pub(u) {
    const { passwordHash: _p, manualStatus: _m, ...rest } = u;
    return { ...rest, status: liveStatus(u), online: (0, presence_1.isOnline)(u.id) };
}
/** Assigned as the patient's attending doctor or nurse. */
const isAssigned = (u, p) => p.nurseIds.includes(u.id) || p.doctorIds.includes(u.id);
exports.isAssigned = isAssigned;
/**
 * Doctors and nurses only see patients they are currently assigned to. When the attending
 * staff is changed, the previous doctor/nurse immediately loses access to that patient.
 */
function canSeePatient(u, p) {
    return p.unitId === u.unitId && ((0, exports.seesAll)(u) || (0, exports.isAssigned)(u, p));
}
function visiblePatients(u) {
    return db_1.db.patients.filter((p) => canSeePatient(u, p));
}
/** Calendar: admins see everything; staff see their own visits for patients still assigned to them. */
function visibleVisits(u) {
    const all = db_1.db.visits.filter((v) => v.unitId === u.unitId);
    if ((0, exports.seesAll)(u))
        return all;
    const mine = new Set(visiblePatients(u).map((p) => p.id));
    return all.filter((v) => (v.doctorId === u.id || v.nurseId === u.id) && mine.has(v.patientId));
}
