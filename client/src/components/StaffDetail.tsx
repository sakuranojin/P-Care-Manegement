import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicUser } from '@shared/types';
import { areaName } from '@shared/areas';
import { ageOf, genderLabel, permissionLabel, roleLabel } from '@shared/labels';
import { api, useApi } from '../api';
import { seesAll, useAuth } from '../auth';
import { useUnitData } from '../data';
import Avatar, { PatientAvatar } from './Avatar';
import { useDetails } from './DetailHost';
import { IconBell, IconChat, IconChevronDown, IconExternal, IconMap, IconPhone } from './Icons';
import { Empty, Modal, StatusPill, VisitPill, byPriority, fmtDate, useToast, ymd } from './ui';

/** Opens (or creates) a one-to-one chat and jumps to it. */
export function useDirectChat() {
  const nav = useNavigate();
  const toast = useToast();
  return async (userId: string) => {
    try {
      const g = await api<{ id: string; pendingIds: string[]; pending: boolean }>('/chat/direct', { userId });
      if (g.pendingIds.length) toast('個別チャットのリクエストを送信しました。相手が承認すると会話できます');
      if (g.pending) toast('この相手からリクエストが届いています。チャット画面で承認してください');
      nav(`/app/chat?g=${g.id}`);
      return true;
    } catch (e: any) {
      toast(e.message, 'err');
      return false;
    }
  };
}

export default function StaffDetail({ id, highlight, onClose }: { id: string; highlight?: string; onClose: () => void }) {
  const { user, unit } = useAuth();
  const toast = useToast();
  const { openPatient } = useDetails();
  const directChat = useDirectChat();
  const { data: staff, error } = useApi<PublicUser>(`/users/${id}`, ['team']);
  const data = useUnitData();
  const [expanded, setExpanded] = useState<string | null>(highlight ?? null);
  const [notice, setNotice] = useState('');
  const [showNotice, setShowNotice] = useState(false);
  const today = ymd(new Date());

  if (error) return <Modal title="スタッフ詳細" onClose={onClose}><Empty>{error}</Empty></Modal>;
  if (!staff) return <Modal title="スタッフ詳細" onClose={onClose} size="xl"><div className="page-loading small">読み込み中…</div></Modal>;
  const isDoctor = staff.role === 'doctor';
  const key = isDoctor ? 'doctorId' : 'nurseId';
  const theirVisits = data.visits.filter((v) => v[key] === staff.id && v.status !== 'cancelled');
  // Only patients currently assigned to this person.
  const patients = data.patients.filter((p) => (isDoctor ? p.doctorIds : p.nurseIds).includes(staff.id));
  const nextOf = (pid: string) => theirVisits.filter((v) => v.patientId === pid && v.status !== 'completed' && v.date >= today).sort(byPriority)[0];
  patients.sort((a, b) => (a.id === highlight ? -1 : b.id === highlight ? 1 : (nextOf(a.id)?.date ?? '9999').localeCompare(nextOf(b.id)?.date ?? '9999')));
  const self = staff.id === user?.id;

  const sendNotice = async () => {
    try {
      await api('/notices/send', { userId: staff.id, text: notice });
      toast(`${staff.name}さんに通知を送信しました`);
      setNotice('');
      setShowNotice(false);
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };

  return (
    <Modal size="xl" title={`${roleLabel[staff.role]}詳細`} onClose={onClose}>
      <div className="staff-view">
        <aside className="staff-profile">
          <Avatar user={staff} size={112} />
          <h2>{staff.name}</h2>
          <StatusPill status={staff.status} />
          <dl className="info">
            <dt>性別</dt><dd>{genderLabel[staff.gender]}</dd>
            <dt>年齢</dt><dd>{ageOf(staff.birthDate)}歳</dd>
            <dt>電話番号</dt><dd>{staff.phone ? <a href={`tel:${staff.phone}`}>{staff.phone}</a> : '—'}</dd>
            <dt>所属ユニット</dt><dd>{unit?.name}</dd>
            <dt>職種</dt><dd><span className={`role-tag rt-${staff.role}`}>{roleLabel[staff.role]}</span></dd>
            <dt>役職</dt><dd>{staff.jobTitle || '—'}</dd>
            <dt>拠点</dt><dd>{areaName(staff.area)}</dd>
            <dt>権限</dt><dd>{staff.permission ? permissionLabel[staff.permission] : '—'}</dd>
          </dl>
          {!self && (
            <div className="staff-actions">
              <button className="btn btn-primary btn-sm" onClick={async () => (await directChat(staff.id)) && onClose()}><IconChat size={16} />チャット</button>
              {seesAll(user) && <button className="btn btn-outline btn-sm" onClick={() => setShowNotice(!showNotice)}><IconBell size={16} />個別通知</button>}
            </div>
          )}
          {showNotice && (
            <div className="notice-form">
              <textarea rows={3} value={notice} onChange={(e) => setNotice(e.target.value)} placeholder={`${staff.name}さんへの連絡内容`} />
              <button className="btn btn-primary btn-sm" disabled={!notice.trim()} onClick={sendNotice}>通知を送信</button>
            </div>
          )}
        </aside>

        {!seesAll(user) && !self ? (
          <section className="staff-patients">
            <div className="privacy-note">
              <b>担当患者・訪問予定は表示されません</b>
              <p className="muted small">他のスタッフが担当する患者情報や訪問予定は、管理者のみ閲覧できます。</p>
            </div>
          </section>
        ) : (
        <section className="staff-patients">
          <h3 className="panel-title">担当患者 <small className="muted">{seesAll(user) ? `${patients.length}名・` : ''}クリックで詳細を表示</small></h3>
          {highlight && <p className="muted small">{isDoctor ? '緑色の患者が今回の訪問対象です。' : '緑色の患者が現在選択中の患者です。'}</p>}
          <ul className="patient-cards">
            {patients.map((p) => {
              const vs = theirVisits.filter((v) => v.patientId === p.id).sort(byPriority);
              const next = nextOf(p.id);
              const open = expanded === p.id;
              return (
                <li key={p.id} className={`pcard ${p.id === highlight ? 'highlight' : ''} ${open ? 'open' : ''}`}>
                  <button className="pcard-main" onClick={() => setExpanded(open ? null : p.id)} aria-expanded={open}>
                    <PatientAvatar size={44} />
                    <div className="grow">
                      <b>{p.name} 様</b> <small className="muted">{genderLabel[p.gender]}・{ageOf(p.birthDate)}歳</small>
                      <small className="block"><IconMap size={14} /> {p.address}</small>
                      <small className="block"><IconPhone size={14} /> {p.phone || '—'}</small>
                    </div>
                    {p.id === highlight && <span className="hl-tag">{isDoctor ? '訪問対象' : '選択中'}</span>}
                    {next && <span className="next-tag">次回 {fmtDate(next.date)} {next.startTime}</span>}
                    <IconChevronDown className="chev" />
                  </button>
                  {open && (
                    <div className="pcard-body">
                      <dl className="info compact">
                        <dt>診断名</dt><dd><b>{p.diagnosis || '—'}</b></dd>
                        <dt>介護度</dt><dd>{p.careLevel || '—'}</dd>
                        <dt>備考</dt><dd>{p.notes || '—'}</dd>
                      </dl>
                      <table className="table mini">
                        <thead><tr><th>訪問日</th><th>時間</th><th>内容</th><th>{isDoctor ? '看護師' : '医師'}</th><th>状態</th></tr></thead>
                        <tbody>
                          {vs.slice(0, 6).map((v) => (
                            <tr key={v.id}>
                              <td className="nowrap">{fmtDate(v.date)}</td><td className="nowrap">{v.startTime}〜{v.endTime}</td><td>{v.purpose}</td>
                              <td>{data.userMap.get(isDoctor ? v.nurseId : v.doctorId)?.name ?? '—'}</td><td><VisitPill status={v.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="row-end"><button className="btn btn-sm btn-outline" onClick={() => openPatient(p.id)}>患者詳細を開く<IconExternal size={14} /></button></div>
                    </div>
                  )}
                </li>
              );
            })}
            {data.loaded && !patients.length && <Empty>閲覧できる担当患者はいません</Empty>}
          </ul>
        </section>
        )}
      </div>
    </Modal>
  );
}
