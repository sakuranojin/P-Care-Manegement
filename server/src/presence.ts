/** Who is logged in right now = who has at least one open Socket.IO connection. */
const connections = new Map<string, number>();

export const isOnline = (userId: string) => (connections.get(userId) ?? 0) > 0;

/** Returns true when the user's online state flipped. */
export function connect(userId: string) {
  const n = (connections.get(userId) ?? 0) + 1;
  connections.set(userId, n);
  return n === 1;
}
export function disconnect(userId: string) {
  const n = Math.max(0, (connections.get(userId) ?? 0) - 1);
  connections.set(userId, n);
  return n === 0;
}
