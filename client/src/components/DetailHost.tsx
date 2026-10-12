import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import PatientDetail from './PatientDetail';
import StaffDetail from './StaffDetail';
import VisitDetail from './VisitDetail';
import VisitForm from './VisitForm';
import { useUnitData } from '../data';
import type { Visit } from '@shared/types';

type LayerSpec =
  | { kind: 'patient'; id: string }
  | { kind: 'staff'; id: string; patientId?: string }
  | { kind: 'visit'; id: string };
type Layer = LayerSpec & { key: number };

interface Api {
  openPatient: (id: string) => void;
  openStaff: (id: string, patientId?: string) => void;
  openVisit: (id: string) => void;
}
const Ctx = createContext<Api>({ openPatient: () => {}, openStaff: () => {}, openVisit: () => {} });
export const useDetails = () => useContext(Ctx);

/** A visit opened from a notification (e.g. a doctor approving a request). */
function VisitLayer({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useUnitData();
  const [editing, setEditing] = useState<Visit | null>(null);
  if (!data.loaded) return null;
  if (!data.visits.some((v) => v.id === id)) return null;
  return editing
    ? <VisitForm data={data} editing={editing} onClose={onClose} />
    : <VisitDetail visitId={id} data={data} onClose={onClose} onEdit={() => setEditing(data.visits.find((v) => v.id === id) ?? null)} />;
}

/** Patient / staff / visit details open as in-page windows layered on top of the current screen. */
export function DetailHost({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const push = useCallback((l: LayerSpec) => setLayers((ls) => [...ls, { ...l, key: Date.now() + Math.random() }]), []);
  const close = (key: number) => setLayers((ls) => ls.filter((l) => l.key !== key));
  const api: Api = {
    openPatient: (id) => push({ kind: 'patient', id }),
    openStaff: (id, patientId) => push({ kind: 'staff', id, patientId }),
    openVisit: (id) => push({ kind: 'visit', id }),
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      {layers.map((l) =>
        l.kind === 'patient' ? <PatientDetail key={l.key} id={l.id} onClose={() => close(l.key)} />
        : l.kind === 'staff' ? <StaffDetail key={l.key} id={l.id} highlight={l.patientId} onClose={() => close(l.key)} />
        : <VisitLayer key={l.key} id={l.id} onClose={() => close(l.key)} />,
      )}
    </Ctx.Provider>
  );
}
