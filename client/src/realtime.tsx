import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';

type Versions = Record<string, number>;
const Ctx = createContext<Versions>({});

/** Holds a version counter per topic; the server pushes `changed` events over Socket.IO. */
export function RealtimeProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const [versions, setVersions] = useState<Versions>({});
  useEffect(() => {
    if (!token) return;
    const s = io({ auth: { token } });
    s.on('changed', (topics: string[]) =>
      setVersions((v) => {
        const n = { ...v };
        topics.forEach((t) => (n[t] = (n[t] ?? 0) + 1));
        return n;
      }),
    );
    // After a reconnect, refetch everything in case we missed events.
    s.io.on('reconnect', () => setVersions((v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x + 1]))));
    return () => {
      s.disconnect();
    };
  }, [token]);
  return <Ctx.Provider value={versions}>{children}</Ctx.Provider>;
}

export function useTopics(topics: string[]) {
  const v = useContext(Ctx);
  return topics.map((t) => v[t] ?? 0).join(',');
}
