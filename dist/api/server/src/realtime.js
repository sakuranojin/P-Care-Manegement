"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRealtime = initRealtime;
exports.changedUnit = changedUnit;
exports.changedUsers = changedUsers;
exports.joinUnitRoom = joinUnitRoom;
exports.notify = notify;
exports.activity = activity;
const socket_io_1 = require("socket.io");
const auth_1 = require("./auth");
const db_1 = require("./db");
const presence_1 = require("./presence");
let io;
function initRealtime(server) {
    io = new socket_io_1.Server(server, { cors: { origin: true } });
    io.on('connection', (socket) => {
        const user = (0, auth_1.userFromToken)(socket.handshake.auth?.token);
        if (!user)
            return socket.disconnect(true);
        socket.join(`user:${user.id}`);
        if (user.unitId)
            socket.join(`unit:${user.unitId}`);
        // Login state drives the automatic 待機中 / 退勤 status.
        if ((0, presence_1.connect)(user.id))
            changedUnit(user.unitId, 'team');
        socket.on('disconnect', () => {
            const u = db_1.db.users.find((x) => x.id === user.id);
            if ((0, presence_1.disconnect)(user.id))
                changedUnit(u?.unitId ?? null, 'team');
        });
    });
}
/** Tell clients that some data changed so they refetch. */
function changedUnit(unitId, ...topics) {
    if (unitId)
        io?.to(`unit:${unitId}`).emit('changed', topics);
}
function changedUsers(userIds, ...topics) {
    for (const id of new Set(userIds))
        io?.to(`user:${id}`).emit('changed', topics);
}
function joinUnitRoom(userId, unitId) {
    io?.in(`user:${userId}`).socketsJoin(`unit:${unitId}`);
}
function notify(userId, kind, text, link = '', fromId) {
    db_1.db.notices.push({ id: (0, db_1.uid)(), userId, kind, text, link, fromId, read: false, createdAt: (0, db_1.now)() });
    (0, db_1.save)();
    changedUsers([userId], 'notices');
}
/** Record an entry in the unit's dashboard activity feed. */
function activity(unitId, kind, text, actorId, userIds, patientId = null) {
    db_1.db.activities.push({ id: (0, db_1.uid)(), unitId, kind, text, actorId, patientId, userIds: [...new Set(userIds.filter(Boolean))], createdAt: (0, db_1.now)() });
    if (db_1.db.activities.length > 2000)
        db_1.db.activities.splice(0, db_1.db.activities.length - 2000);
    (0, db_1.save)();
    changedUnit(unitId, 'activities');
}
