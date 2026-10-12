"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOnline = void 0;
exports.connect = connect;
exports.disconnect = disconnect;
/** Who is logged in right now = who has at least one open Socket.IO connection. */
const connections = new Map();
const isOnline = (userId) => (connections.get(userId) ?? 0) > 0;
exports.isOnline = isOnline;
/** Returns true when the user's online state flipped. */
function connect(userId) {
    const n = (connections.get(userId) ?? 0) + 1;
    connections.set(userId, n);
    return n === 1;
}
function disconnect(userId) {
    const n = Math.max(0, (connections.get(userId) ?? 0) - 1);
    connections.set(userId, n);
    return n === 0;
}
