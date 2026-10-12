"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeJST = exports.todayJST = exports.now = exports.uid = exports.db = exports.UPLOAD_DIR = exports.DATA_DIR = void 0;
exports.save = save;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
// Persist to a JSON file. On Railway, mount a volume and point DATA_DIR at it.
exports.DATA_DIR = path_1.default.resolve(process.env.DATA_DIR || path_1.default.join(process.cwd(), 'data'));
exports.UPLOAD_DIR = path_1.default.join(exports.DATA_DIR, 'uploads');
fs_1.default.mkdirSync(exports.UPLOAD_DIR, { recursive: true });
const DB_FILE = path_1.default.join(exports.DATA_DIR, 'db.json');
const empty = () => ({
    users: [], units: [], patients: [], visits: [], patientUpdates: [], invitations: [],
    groups: [], messages: [], broadcasts: [], notices: [], activities: [], posts: [], emails: [], joinRequests: [], meta: {},
});
function load() {
    try {
        return { ...empty(), ...JSON.parse(fs_1.default.readFileSync(DB_FILE, 'utf8')) };
    }
    catch {
        return empty();
    }
}
exports.db = load();
let timer;
function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
        fs_1.default.writeFileSync(DB_FILE + '.tmp', JSON.stringify(exports.db));
        fs_1.default.renameSync(DB_FILE + '.tmp', DB_FILE);
    }, 150);
}
const uid = () => crypto_1.default.randomUUID();
exports.uid = uid;
const now = () => new Date().toISOString();
exports.now = now;
const jst = (offsetMs = 0) => new Date(Date.now() + 9 * 3600_000 + offsetMs).toISOString();
/** Today's date in Japan time (YYYY-MM-DD). */
const todayJST = (offsetDays = 0) => jst(offsetDays * 86400_000).slice(0, 10);
exports.todayJST = todayJST;
/** Current time in Japan (HH:mm). */
const timeJST = () => jst().slice(11, 16);
exports.timeJST = timeJST;
