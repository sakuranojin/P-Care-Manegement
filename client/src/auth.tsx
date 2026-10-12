import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicUser, Unit } from '@shared/types';
import { api, getToken, setToken } from './api';
import { RealtimeProvider, useTopics } from './realtime';

interface AuthState {
  user: PublicUser | null;
  unit: Unit | null;
  loading: boolean;
  signIn: (token: string, user: PublicUser) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser) => void;
}

const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export const isManager = (u?: PublicUser | null) => u?.permission === 'owner' || u?.permission === 'manager';
export const canEditSchedule = (u?: PublicUser | null) => isManager(u) || u?.permission === 'schedule_edit';
/** Administrators never enter or edit visit appointments. */
export const canSchedule = (u?: PublicUser | null) => !!u && u.role !== 'admin' && canEditSchedule(u);
export const seesAll = (u?: PublicUser | null) => !!u && (u.role === 'admin' || isManager(u));
export const canManagePatients = (u?: PublicUser | null) => !!u && (u.role === 'nurse' || u.role === 'admin' || isManager(u));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState(getToken());
  const [user, setUser] = useState<PublicUser | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(!!token);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      const d = await api<{ user: PublicUser; unit: Unit | null }>('/auth/me');
      setUser(d.user);
      setUnit(d.unit);
    } catch (e: any) {
      if (e.status === 401) {
        setToken(null);
        setTok(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = (t: string, u: PublicUser) => {
    setToken(t);
    setTok(t);
    setUser(u);
    refresh();
  };
  const signOut = () => {
    setToken(null);
    setTok(null);
    setUser(null);
    setUnit(null);
  };

  return (
    <RealtimeProvider token={token}>
      <Ctx.Provider value={{ user, unit, loading, signIn, signOut, refresh, setUser }}>
        <MeSync refresh={refresh} />
        {children}
      </Ctx.Provider>
    </RealtimeProvider>
  );
}

/** Re-read the current user when team/unit data changes (e.g. permission granted). */
function MeSync({ refresh }: { refresh: () => Promise<void> }) {
  const v = useTopics(['team', 'me', 'unit', 'invitations']);
  useEffect(() => {
    if (v !== '0,0,0,0') refresh();
  }, [v, refresh]);
  return null;
}
