import { useState } from 'react';
import type { Attachment, PublicUser, Visit } from '@shared/types';
import { ageOf, displayStatus, genderLabel, hasStarted, roleLabel } from '@shared/labels';
import { api } from '../api';
import { canSchedule, useAuth } from '../auth';
import type { useUnitData } from '../data';
import Avatar, { PatientAvatar } from './Avatar';
import FilePicker from './FilePicker';
import { useDetails } from './DetailHost';
import { IconCheck, IconClock } from './Icons';
import { Attachments, Modal, StatusPill, VisitPill, fmtDate, fmtDateTime, nowHM, useToast, ymd } from './ui';

type Data = ReturnType<typeof useUnitData>;

/** Marker showing whether the doctor has approved the visit (avatar + name once approved). */
export function ApprovalMark({ v, doctor, compact }: { v: Visit; doctor?: PublicUser; compact?: boolean }) {
  if (v.status === 'cancelled') return null;
  if (v.approval === 'approved' && doctor) {
    return (
      <span className={`approval-mark ${v.urgent ? 'urgent' : ''}`} title={`${doctor.name}医師が承認済み`}>
        <Avatar user={doctor} size={compact ? 18 : 22} showMark={false} />
        {!compact && <>{doctor.name}</>}<IconCheck size={12} />{!compact && (v.urgent ? '応援医師・承認済み' : '承認済み')}
      </span>
    );
  }
  if (v.approval === 'pending') return <span className="approval-mark pending"><IconClock size={12} />{compact ? '承認待ち' : '医師の承認待ち'}</span>;
  return null;
}

function StaffCard({ u, title, onDetail }: { u?: PublicUser; title: string; onDetail: () => void }) {
  return (
    <div className="vd-card">
      <small className="vd-label">{title}</small>
      {u ? (
        <>
          <div className="vd-person"><Avatar user={u} size={48} /><div><b>{u.name}</b><small>{u.jobTitle || roleLabel[u.role]}</small><StatusPill status={u.status} /></div></div>
          <button className="btn btn-sm btn-outline" onClick={onDetail}>詳細を見る</button>
        </>
      ) : <p className="muted">未設定</p>}
    </div>
  );
}

export default function VisitDetail({ visitId, data, onClose, onEdit }: { visitId: string; data: Data; onClose: () => void; onEdit: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { openPatient, openStaff } = useDetails();
  const v = data.visits.find((x) => x.id === visitId);
  const [reporting, setReporting] = useState(false);
  const [report, setReport] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  if (!v || !user) return null;
  const p = data.patientMap.get(v.patientId);
  const doctor = data.userMap.get(v.doctorId);
  const nurse = data.userMap.get(v.nurseId);
  const today = ymd(new Date());
  const now = nowHM();
  const shown = displayStatus(v, today, now);
  const isDoctor = v.doctorId === user.id;
  const open = v.status === 'scheduled' || v.status === 'in_progress';
  const started = hasStarted(v, today, now);
  const approved = v.approval === 'approved';

  const act = async (path: string, body: unknown, msg: string) => {
    setBusy(true);
    try {
      await api(`/visits/${v.id}/${path}`, body);
      toast(msg);
      setReporting(false);
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={<>訪問予定の詳細 <VisitPill status={shown} />{v.urgent && <span className="urgent-tag">緊急</span>}</>} onClose={onClose} wide>
      <div className="vd-meta">
        <span>{fmtDate(v.date)} {v.startTime}〜{v.endTime}</span>
        <span>{v.purpose}</span>
        <ApprovalMark v={v} doctor={doctor} />
      </div>
      {shown === 'pending_report' && <p className="notice-box warn small">訪問予定時刻を過ぎていますが、訪問記録がまだ登録されていません（未報告）。</p>}
      <div className="vd-grid">
        <div className="vd-card">
          <small className="vd-label">患者情報</small>
          {p ? (
            <>
              <div className="vd-person">
                <PatientAvatar size={44} />
                <div><b>{p.name} 様</b><small>{genderLabel[p.gender]}・{ageOf(p.birthDate)}歳</small></div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => openPatient(p.id)}>詳細を見る</button>
            </>
          ) : <p className="muted">閲覧権限がありません</p>}
        </div>
        <StaffCard u={nurse} title="看護師情報" onDetail={() => openStaff(v.nurseId, v.patientId)} />
        <StaffCard u={doctor} title={v.urgent ? '応援医師（緊急）' : '医師情報'} onDetail={() => openStaff(v.doctorId, v.patientId)} />
      </div>

      {v.status === 'completed' && (
        <div className="report-box">
          <h4>訪問レポート <small>{v.completedAt && fmtDateTime(v.completedAt)} 完了・記録は削除できません</small></h4>
          <p className="pre">{v.report}</p>
          <Attachments items={v.attachments} />
        </div>
      )}

      {reporting && (
        <div className="report-box editing">
          <h4>訪問記録の登録</h4>
          <div className="field">
            <label>訪問レポート <em>必須</em></label>
            <textarea rows={5} value={report} onChange={(e) => setReport(e.target.value)} placeholder="診察所見・処置内容・処方変更・次回までの注意点など" />
          </div>
          <FilePicker value={files} onChange={setFiles} label="画像・ファイルをアップロード" />
          <div className="row-end">
            <button className="btn btn-ghost" onClick={() => setReporting(false)}>戻る</button>
            <button className="btn btn-primary" disabled={busy || !report.trim()} onClick={() => act('complete', { report, attachments: files }, '訪問を完了しました')}>記録して完了</button>
          </div>
        </div>
      )}

      {!reporting && (
        <div className="vd-actions">
          {isDoctor && v.status === 'scheduled' && v.approval === 'pending' && (
            <>
              <button className="btn btn-primary" disabled={busy} onClick={() => act('approve', {}, '訪問を承認しました')}><IconCheck size={16} />承認する</button>
              <button className="btn btn-ghost danger" disabled={busy} onClick={() => confirm('この訪問を辞退しますか？予定はキャンセルされます。') && act('decline', {}, '訪問を辞退しました')}>{v.urgent ? 'キャンセル（辞退）' : '辞退する'}</button>
            </>
          )}
          {v.status === 'scheduled' && approved && !started && (
            <small className="muted">開始時刻（{v.startTime}）になると自動で「訪問中」になります</small>
          )}
          {isDoctor && open && approved && (
            <button className="btn btn-primary" disabled={!started} title={started ? '' : '予定時刻を過ぎると記録できます'} onClick={() => setReporting(true)}>
              訪問記録を登録{!started && `（${v.startTime}以降）`}
            </button>
          )}
          {v.status === 'scheduled' && canSchedule(user) && (
            <>
              <button className="btn btn-outline" onClick={onEdit}>予定を編集</button>
              <button className="btn btn-ghost danger" disabled={busy} onClick={() => confirm('この訪問予定をキャンセルしますか？') && act('cancel', {}, '訪問予定をキャンセルしました')}>キャンセル</button>
            </>
          )}
          {user.role === 'admin' && <small className="muted">管理者は訪問予定の登録・編集を行いません（閲覧のみ）</small>}
        </div>
      )}
    </Modal>
  );
}
