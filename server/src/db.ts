import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  Activity, Broadcast, ChatGroup, EmailLog, JoinRequest, Invitation, Message, Notice, Patient, PatientUpdate, Post, PublicUser, Unit, Visit,
} from '../../shared/types';

/** Stored user. status/online are computed when the user is sent to clients. */
export interface User extends Omit<PublicUser, 'status' | 'online'> {
  passwordHash: string;
  manualStatus: 'waiting' | 'busy'; // administrators only
}

export interface DB {
  users: User[];
  units: Unit[];
  patients: Patient[];
  visits: Visit[];
  patientUpdates: PatientUpdate[];
  invitations: Invitation[];
  groups: ChatGroup[];
  messages: Message[];
  broadcasts: Broadcast[];
  notices: Notice[];
  activities: Activity[];
  posts: Post[];
  emails: EmailLog[];
  joinRequests: JoinRequest[];
  meta: { lastDailyReport?: string };
}

// Persist to a JSON file. On Railway, mount a volume and point DATA_DIR at it.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'db.json');

const empty = (): DB => ({
  users: [], units: [], patients: [], visits: [], patientUpdates: [], invitations: [],
  groups: [], messages: [], broadcasts: [], notices: [], activities: [], posts: [], emails: [], joinRequests: [], meta: {},
});

function load(): DB {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

export const db: DB = load();

let timer: NodeJS.Timeout | undefined;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  }, 150);
}

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

const jst = (offsetMs = 0) => new Date(Date.now() + 9 * 3600_000 + offsetMs).toISOString();
/** Today's date in Japan time (YYYY-MM-DD). */
export const todayJST = (offsetDays = 0) => jst(offsetDays * 86400_000).slice(0, 10);
/** Current time in Japan (HH:mm). */
export const timeJST = () => jst().slice(11, 16);
