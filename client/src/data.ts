import { useMemo } from 'react';
import type { Patient, PublicUser, Visit } from '@shared/types';
import { useApi } from './api';

/** Team, patients and visits visible to the current user, kept live via Socket.IO. */
export function useUnitData() {
  const team = useApi<PublicUser[]>('/team', ['team']);
  const patients = useApi<Patient[]>('/patients', ['patients', 'visits']);
  const visits = useApi<Visit[]>('/visits', ['visits']);
  const userMap = useMemo(() => new Map((team.data ?? []).map((u) => [u.id, u])), [team.data]);
  const patientMap = useMemo(() => new Map((patients.data ?? []).map((p) => [p.id, p])), [patients.data]);
  return {
    team: team.data ?? [],
    patients: patients.data ?? [],
    visits: visits.data ?? [],
    userMap,
    patientMap,
    loaded: !!(team.data && patients.data && visits.data),
    error: team.error || patients.error || visits.error,
  };
}
