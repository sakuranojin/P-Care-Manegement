import { useEffect, useState } from 'react';
import type { Slot, Visit } from '@shared/types';
import { fromMin, toMin } from '@shared/labels';
import { areaName } from '@shared/areas';
import { api } from '../api';
import { useAuth } from '../auth';
import type { useUnitData } from '../data';
import Avatar from './Avatar';
import { IconCheck, IconSparkle } from './Icons';
import { Modal, StatusPill, useToast } from './ui';

type Data = ReturnType<typeof useUnitData>;
interface Check {
  ok: boolean;
  error?: string;
  autoSlot?: Slot | null;
}
interface Assistant {
  doctorId: string;
  distanceKm: number | null;
  dayLoad: number;
  reason: string;
}

/**
 * Visit booking. The doctor is the patient's attending physician. If that doctor is already booked,
 * the AI recommends assistant doctors (応援医師) who are free at that time, closest to the patient first;
 * the user picks one (and can still adjust the time). The assistant is notified of an emergency patient.
 */
export default function VisitForm({ data, initial, editing, onClose }: { data: Data; initial?: Partial<Visit>; editing?: Visit; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const base = editing ?? initial ?? {};
  const [f, setF] = useState({
    patientId: base.patientId ?? '',
    date: base.date ?? '',
    startTime: base.startTime ?? '10:00',
    endTime: base.endTime ?? '11:00',
    purpose: base.purpose ?? '定期訪問診療',
  });
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const [assistants, setAssistants] = useState<Assistant[] | null>(null);
  const [assistErr, setAssistErr] = useState('');
  const [busy, setBusy] = useState(false);

  const patient = data.patientMap.get(f.patientId);
  const attendingId = editing?.doctorId ?? patient?.doctorIds[0] ?? '';
  const doctorId = assistantId ?? attendingId;
  const doctor = data.userMap.get(doctorId);
  const attending = data.userMap.get(attendingId);
  const duration = Math.max(15, toMin(f.endTime) - toMin(f.startTime));
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const validTime = !!f.date && !!f.startTime && !!f.endTime && toMin(f.endTime) > toMin(f.startTime);

  // Live availability check for whichever doctor is selected.
  useEffect(() => {
    if (!f.patientId || !doctorId || !validTime) {
      setCheck(null);
      return;
    }
    setChecking(true);
    const t = setTimeout(() => {
      api<Check>('/visits/check', { ...f, doctorId, assistantId, excludeId: editing?.id })
        .then(setCheck)
        .catch(() => setCheck(null))
        .finally(() => setChecking(false));
    }, 300);
    return () => clearTimeout(t);
  }, [f.patientId, doctorId, f.date, f.startTime, f.endTime, editing?.id]);

  // The attending doctor is booked → ask the AI for assistant doctors free at this time.
  const attendingBusy = !assistantId && check && !check.ok;
  useEffect(() => {
    setAssistants(null);
    setAssistErr('');
    if (!attendingBusy || editing) return;
    api<Assistant[]>('/visits/assistants', { ...f })
      .then(setAssistants)
      .catch((e) => setAssistErr(e.message));
  }, [attendingBusy, f.date, f.startTime, f.endTime, f.patientId]);

  const submit = async () => {
    setBusy(true);
    try {
      if (editing) await api(`/visits/${editing.id}`, f, 'PUT');
      else await api('/visits', { ...f, doctorId, assistantId });
      toast(editing ? '訪問予定を更新しました（医師に再承認を依頼しました）'
        : assistantId ? `${doctor?.name}医師に「緊急患者」として応援を依頼しました（承認待ち）`
        : '訪問予定を登録し、担当医師に承認を依頼しました');
      onClose();
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const applySlot = (s: Slot) => set({ startTime: s.startTime, endTime: s.endTime });

  return (
    <Modal title={editing ? '訪問予定を編集' : '訪問予定を追加'} onClose={onClose} wide
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>キャンセル</button>
        <button className={`btn ${assistantId ? 'btn-urgent' : 'btn-primary'}`} onClick={submit} disabled={busy || checking || !patient || !doctor || !f.date || !!(check && !check.ok)}>
          {busy ? '保存中…' : editing ? '更新する' : assistantId ? '応援医師で予定を確定' : '予定を確定する'}
        </button>
      </>}>
      <div className="visit-form">
        <div className="grid-2">
          <div className="field">
            <label>患者 <em>必須</em></label>
            <select value={f.patientId} disabled={!!editing} onChange={(e) => { setAssistantId(null); set({ patientId: e.target.value }); }}>
              <option value="">選択してください</option>
              {data.patients.map((p) => <option key={p.id} value={p.id}>{p.name}（{areaName(p.area)}）</option>)}
            </select>
          </div>
          <div className="field">
            <label>訪問日 <em>必須</em></label>
            <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
        </div>

        <div className="field">
          <label>{assistantId ? '応援医師（緊急）' : '担当医師'}</label>
          {doctor ? (
            <div className={`assigned-doctor ${assistantId ? 'assistant' : ''}`}>
              <Avatar user={doctor} size={40} />
              <div className="grow">
                <b>{doctor.name}{assistantId && <span className="urgent-tag">応援医師</span>}</b>
                <small>{assistantId ? `担当医（${attending?.name}）の代わりに対応・${areaName(doctor.area)}` : `担当医（患者情報に登録済み）・${areaName(doctor.area)}`}</small>
              </div>
              <StatusPill status={doctor.status} />
              {assistantId && <button className="btn btn-sm btn-ghost" onClick={() => setAssistantId(null)}>担当医に戻す</button>}
            </div>
          ) : (
            <p className="muted small">{patient ? 'この患者には担当医師が登録されていません' : '患者を選択すると担当医師が表示されます'}</p>
          )}
          {user?.role === 'nurse' && <small className="hint">同行看護師: あなた（{user.name}）</small>}
        </div>

        <div className="grid-3">
          <div className="field">
            <label>開始時刻</label>
            <input type="time" step={900} value={f.startTime} onChange={(e) => {
              const s = e.target.value;
              if (s) set({ startTime: s, endTime: fromMin(Math.min(toMin(s) + duration, 23 * 60 + 45)) });
            }} />
          </div>
          <div className="field">
            <label>終了時刻</label>
            <input type="time" step={900} value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} />
          </div>
          <div className="field">
            <label>訪問内容</label>
            <input value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} list="purposes" />
            <datalist id="purposes">
              {['定期訪問診療', '臨時往診', '緊急往診', '処方調整', '血液検査', '状態確認・バイタル測定', '褥瘡処置', '看取り対応'].map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
        </div>

        <div className={`auto-check ${checking ? 'checking' : check && !check.ok ? 'ng' : check?.ok ? 'ok' : ''}`}>
          <b><IconSparkle size={16} /> AIスケジュールチェック</b>
          {checking ? <span>{doctor?.name ?? '医師'}の空き状況を確認しています…</span>
            : check && !check.ok ? <span>{check.error}</span>
            : check?.ok ? <span><IconCheck size={14} /> {doctor?.name}医師はこの時間に対応可能です</span>
            : <span>患者・日時を入力すると、医師の予定と重ならないか自動でチェックします</span>}
          {attendingBusy && check?.autoSlot && (
            <div className="slot-row"><small>担当医の空き時間:</small>
              <button className="slot" onClick={() => applySlot(check.autoSlot!)}>{check.autoSlot.startTime}〜{check.autoSlot.endTime} に変更</button>
            </div>
          )}
        </div>

        {attendingBusy && !editing && (
          <div className="assist-box">
            <div className="assist-head">
              <b><IconSparkle size={16} /> AIが推奨する応援医師</b>
              <small>{f.startTime}〜{f.endTime} に予定がなく、患者宅（{patient ? areaName(patient.area) : '—'}）から近い順に表示しています。選択すると「緊急患者」として医師に通知され、承認後に確定します。</small>
            </div>
            {assistErr && <p className="form-error">{assistErr}</p>}
            <ol className="ai-list">
              {assistants?.map((a, i) => {
                const d = data.userMap.get(a.doctorId);
                if (!d) return null;
                return (
                  <li key={a.doctorId}>
                    <span className="rank">{i + 1}</span>
                    <Avatar user={d} size={40} />
                    <div className="grow">
                      <b>{d.name}{i === 0 && <span className="tag tag-accent tag-sm">AIおすすめ</span>}</b>
                      <small>{a.reason}</small>
                    </div>
                    <StatusPill status={d.status} />
                    <button className="btn btn-sm btn-urgent" onClick={() => setAssistantId(a.doctorId)}>この医師を選択</button>
                  </li>
                );
              })}
              {assistants && !assistants.length && <li className="muted">この時間に対応できる医師がいません。時間を変更してください。</li>}
            </ol>
          </div>
        )}
      </div>
    </Modal>
  );
}
