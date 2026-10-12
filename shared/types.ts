export type Role = 'admin' | 'nurse' | 'doctor';
export type Gender = 'male' | 'female' | 'other';
/** "manager" is shown as 代理 (proxy): same capabilities as the administrator. */
export type Permission = 'owner' | 'manager' | 'schedule_edit' | 'read_only';
/** visiting/waiting/off are automatic; busy can only be set manually by administrators. */
export type StaffStatus = 'waiting' | 'visiting' | 'off' | 'busy';
export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Attachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  gender: Gender;
  birthDate: string;
  role: Role;
  avatar: string; // "preset:N" or an image URL
  jobTitle: string;
  phone: string;
  area: string; // base area id (see areas.ts)
  unitId: string | null;
  permission: Permission | null;
  status: StaffStatus; // computed by the server
  online: boolean;
  profileCompleted: boolean;
  createdUnit: boolean;
  createdAt: string;
}

export interface Unit {
  id: string;
  name: string;
  address: string;
  ownerId: string;
  createdAt: string;
}

export interface Patient {
  id: string;
  unitId: string;
  name: string;
  kana: string;
  gender: Gender;
  birthDate: string;
  address: string;
  area: string;
  phone: string;
  email: string;
  diagnosis: string;
  careLevel: string;
  notes: string;
  nurseIds: string[];
  doctorIds: string[];
  createdAt: string;
}

export interface Visit {
  id: string;
  unitId: string;
  patientId: string;
  doctorId: string;
  nurseId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;
  purpose: string;
  /** Emergency visit: handled by an emergency support doctor (緊急対応医). */
  urgent: boolean;
  /** The doctor must approve every visit before it can go ahead. */
  approval: 'pending' | 'approved' | 'declined';
  approvedAt: string | null;
  status: VisitStatus;
  report: string;
  attachments: Attachment[];
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PatientUpdate {
  id: string;
  patientId: string;
  authorId: string;
  content: string;
  attachments: Attachment[];
  createdAt: string;
}

export interface Invitation {
  id: string;
  unitId: string;
  inviterId: string;
  inviteeId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface ChatGroup {
  id: string;
  unitId: string;
  name: string;
  direct: boolean;
  memberIds: string[];
  pendingIds: string[];
  createdBy: string;
  createdAt: string;
}

export interface Message {
  id: string;
  groupId: string;
  senderId: string;
  text: string;
  attachments: Attachment[];
  replyTo: string | null;
  editedAt?: string | null;
  createdAt: string;
  readBy: string[];
}

export interface Broadcast {
  id: string;
  unitId: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: string;
  readBy: string[];
}

export interface Notice {
  id: string;
  userId: string;
  kind: 'invitation' | 'chat_invite' | 'visit' | 'info' | 'message' | 'urgent';
  text: string;
  /** "/app/..." route, "patient:<id>" or "visit:<id>" to open details in place */
  link: string;
  fromId?: string; // 'system' for automatic notifications
  read: boolean;
  createdAt: string;
}

/** Unit activity feed shown on the dashboard ("田中医師が訪問を完了しました"). */
export interface Activity {
  id: string;
  unitId: string;
  kind: 'visit_created' | 'visit_started' | 'visit_completed' | 'visit_cancelled' | 'visit_approved' | 'visit_declined' | 'patient_added' | 'patient_update' | 'urgent' | 'member_joined';
  text: string;
  actorId: string;
  patientId: string | null;
  userIds: string[]; // who it is relevant to (doctors/nurses only see these)
  createdAt: string;
}

/** real = name + avatar, nickname = chosen nickname only, anonymous = nothing identifying. */
export type PostIdentity = 'real' | 'nickname' | 'anonymous';

export interface PostReply {
  id: string;
  authorId: string; // '' when hidden from the viewer
  identity: PostIdentity;
  nickname: string;
  mine?: boolean;
  text: string;
  createdAt: string;
}

/** Feedback / comments board post. */
export interface Post {
  id: string;
  unitId: string;
  authorId: string; // '' when hidden from the viewer
  identity: PostIdentity;
  nickname: string;
  mine?: boolean;
  text: string;
  attachments: Attachment[];
  likes: string[];
  seenBy?: string[];
  replies: PostReply[];
  createdAt: string;
}

export interface Conflict {
  visit: Visit;
  who: 'doctor' | 'nurse';
}

export interface Slot {
  startTime: string;
  endTime: string;
}

export interface DoctorSuggestion {
  doctorId: string;
  distanceKm: number | null;
  available: boolean;
  assigned: boolean;
  dayLoad: number;
  score: number;
  reason: string;
  nextSlot: Slot | null;
}

/** Visit notification emails to patients (kept as an outbox; delivered when SMTP is configured). */
export interface EmailLog {
  id: string;
  unitId: string;
  patientId: string;
  to: string;
  subject: string;
  body: string;
  status: 'sent' | 'not_configured' | 'failed';
  createdAt: string;
}
/** A registrant asking to join an affiliated unit (approved or cancelled by the unit's administrators). */
export interface JoinRequest {
  id: string;
  unitId: string;
  userId: string;
  status: 'pending' | 'approved' | 'cancelled' | 'withdrawn';
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}