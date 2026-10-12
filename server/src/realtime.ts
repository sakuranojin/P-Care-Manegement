import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { userFromToken } from './auth';
import { db, now, save, uid } from './db';
import { connect, disconnect } from './presence';
import type { Activity, Notice } from '../../shared/types';

let io: Server | undefined;

export function initRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: true } });
  io.on('connection', (socket) => {
    const user = userFromToken(socket.handshake.auth?.token);
    if (!user) return socket.disconnect(true);
    socket.join(`user:${user.id}`);
    if (user.unitId) socket.join(`unit:${user.unitId}`);
    // Login state drives the automatic 待機中 / 退勤 status.
    if (connect(user.id)) changedUnit(user.unitId, 'team');
    socket.on('disconnect', () => {
      const u = db.users.find((x) => x.id === user.id);
      if (disconnect(user.id)) changedUnit(u?.unitId ?? null, 'team');
    });
  });
}

/** Tell clients that some data changed so they refetch. */
export function changedUnit(unitId: string | null, ...topics: string[]) {
  if (unitId) io?.to(`unit:${unitId}`).emit('changed', topics);
}
export function changedUsers(userIds: string[], ...topics: string[]) {
  for (const id of new Set(userIds)) io?.to(`user:${id}`).emit('changed', topics);
}
export function joinUnitRoom(userId: string, unitId: string) {
  io?.in(`user:${userId}`).socketsJoin(`unit:${unitId}`);
}

export function notify(userId: string, kind: Notice['kind'], text: string, link = '', fromId?: string) {
  db.notices.push({ id: uid(), userId, kind, text, link, fromId, read: false, createdAt: now() });
  save();
  changedUsers([userId], 'notices');
}

/** Record an entry in the unit's dashboard activity feed. */
export function activity(unitId: string, kind: Activity['kind'], text: string, actorId: string, userIds: string[], patientId: string | null = null) {
  db.activities.push({ id: uid(), unitId, kind, text, actorId, patientId, userIds: [...new Set(userIds.filter(Boolean))], createdAt: now() });
  if (db.activities.length > 2000) db.activities.splice(0, db.activities.length - 2000);
  save();
  changedUnit(unitId, 'activities');
}
