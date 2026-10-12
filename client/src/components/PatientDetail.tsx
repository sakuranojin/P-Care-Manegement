import { Fragment, useState } from 'react';
import type { Attachment, EmailLog, Patient, PatientUpdate, PublicUser, Visit } from '@shared/types';
import { areaName } from '@shared/areas';
import { ageOf, displayStatus, genderLabel, roleLabel } from '@shared/labels';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import Avatar, { PatientAvatar } from './Avatar';
import FilePicker from './FilePicker';
import { useDetails } from './DetailHost';
import { IconHeart, IconMail, IconMap, IconPhone } from './Icons';
import { Attachments, Empty, Modal, VisitPill, byUrgency, fmtDate, fmtDateTime, nowHM, useToast, ymd } from './ui';

interface Detail {
  patient: Patient;
  visits: Visit[];
  updates: PatientUpdate[];
  emails: EmailLog[];
  mailConfigured: boolean;
}

const RECENT = 3; // the section always shows only the latest few records

/** Every record for the patient, opened from the compact section. */
function AllRecordsModal({ updates, userMap, onOpen, onClose }: { updates: PatientUpdate[]; userMap: Map<string, PublicUser>; onOpen: (u: PatientUpdate) => void; onClose: () => void }) {
  return (
    <Modal title={`状態の記録・共有（全${updates.length}件）`} size="wide" onClose={onClose}>
      <ul className="record-list all">
        {updates.map((u) => {
          const a = userMap.get(u.authorId);
          return (
            <li key={u.id} onClick={() => onOpen(u)} title="クリックで全文を表示">
              {a && <Avatar user={a} size={32} />}
              <div className="grow">
                <small><b>{a?.name}</b>・{fmtDateTime(u.createdAt)}{u.attachments.length > 0 && `・📎${u.attachments.length}`}</small>
                <p className="clamp">{u.content || '（添付ファイル）'}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Full record of one status update, opened from the compact list. */
function RecordModal({ u, author, onClose }: { u: PatientUpdate; author?: PublicUser; onClose: () => void }) {
  return (
    <Modal title="状態の記録" size="xl" onClose={onClose}>
      <div className="record-head">
        {author && <Avatar user={author} size={44} />}
        <div><b>{author?.name}</b><small>{author && roleLabel[author.role]}・{fmtDateTime(u.createdAt)}</small></div>
      </div>
      <p className="pre record-body">{u.content}</p>
      <Attachments items={u.attachments} large />
    </Modal>
  );
}

export default function PatientDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { openStaff } = useDetails();
  const { data, error } = useApi<Detail>(`/patients/${id}`, ['visits', 'patients', `patient:${id}`]);
  const { data: team } = useApi<PublicUser[]>('/team', ['team']);
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [openVisit, setOpenVisit] = useState<string | null>(null);
  const [record, setRecord] = useState<PatientUpdate | null>(null);
  const [showAll, setShowAll] = useState(false);
  const userMap = new Map((team ?? []).map((u) => [u.id, u]));

  if (error) return <Modal title="患者詳細" onClose={onClose}><Empty>{error}</Empty></Modal>;
  if (!data) return <Modal title="患者詳細" onClose={onClose} size="xl"><div className="page-loading small">読み込み中…</div></Modal>;
  const { patient: p, updates } = data;
  // Most urgent first: in progress, then the soonest upcoming visit, then unreported, then past records.
  const visits = data.visits.filter((v) => v.status !== 'cancelled').sort(byUrgency(ymd(new Date()), nowHM()));
  const staff = [...p.doctorIds, ...p.nurseIds].map((x) => userMap.get(x)).filter(Boolean) as PublicUser[];
  const assigned = !!user && (p.doctorIds.includes(user.id) || p.nurseIds.includes(user.id));

  const post = async () => {
    setBusy(true);
    try {
      await api(`/patients/${p.id}/updates`, { content, attachments: files });
      setContent('');
      setFiles([]);
      toast('状態を記録し、関係者に共有しました');
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal size="xl" onClose={onClose} title={<>患者詳細</>}>
      <div className="patient-hero">
        <PatientAvatar size={76} />
        <div className="grow">
          <small className="muted">{p.kana}</small>
          <h2>{p.name} 様</h2>
          <div className="tags">
            <span className="tag">{genderLabel[p.gender]}</span>
            <span className="tag">{ageOf(p.birthDate)}歳（{p.birthDate.replace(/-/g, '/')}生）</span>
            {p.careLevel && <span className="tag tag-accent">{p.careLevel}</span>}
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <h3 className="panel-title">基本情報</h3>
          <dl className="info">
            <dt>年齢</dt><dd>{ageOf(p.birthDate)}歳</dd>
            <dt><IconMap size={16} />住所</dt><dd>{p.address}<small className="block muted">{areaName(p.area)}</small></dd>
            <dt><IconPhone size={16} />電話番号</dt><dd>{p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : '—'}</dd>
            <dt><IconMail size={16} />メール</dt><dd>{p.email || '—'}</dd>
            <dt><IconHeart size={16} />診断名</dt><dd><b>{p.diagnosis || '—'}</b></dd>
            <dt>備考</dt><dd>{p.notes || '—'}</dd>
          </dl>
          <h4 className="sub-title">担当スタッフ</h4>
          <ul className="staff-mini">
            {staff.map((s) => (
              <li key={s.id}>
                <button className="staff-chip" onClick={() => openStaff(s.id, p.id)}>
                  <Avatar user={s} size={34} /><span>{s.name}<small>{p.doctorIds.includes(s.id) ? '担当医師' : '担当看護師'}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3 className="panel-title">状態の記録・共有</h3>
          {assigned ? (
            <div className="update-form">
              <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="バイタル・食事・排泄・皮膚の状態など、気づいたことを記録してください" />
              <div className="row-between">
                <FilePicker value={files} onChange={setFiles} />
                <button className="btn btn-primary btn-sm" onClick={post} disabled={busy || (!content.trim() && !files.length)}>記録して共有</button>
              </div>
            </div>
          ) : (
            <p className="muted small">記録の追加は、この患者の担当医師・担当看護師のみ可能です。</p>
          )}
          {/* Fixed height: only the latest records are shown; click to see everything in a pop-up. */}
          <div className="record-box" onClick={() => updates.length && setShowAll(true)} role="button" tabIndex={0} title="クリックですべての記録を表示">
            <ul className="record-list compact">
              {updates.slice(0, RECENT).map((u) => {
                const a = userMap.get(u.authorId);
                return (
                  <li key={u.id}>
                    {a && <Avatar user={a} size={28} />}
                    <div className="grow">
                      <small><b>{a?.name}</b>・{fmtDateTime(u.createdAt)}{u.attachments.length > 0 && `・📎${u.attachments.length}`}</small>
                      <p className="clamp one">{u.content || '（添付ファイル）'}</p>
                    </div>
                  </li>
                );
              })}
              {!updates.length && <Empty>まだ記録はありません</Empty>}
            </ul>
            {updates.length > 0 && (
              <div className="record-more">{updates.length > RECENT ? `他 ${updates.length - RECENT}件の古い記録を含む` : ''} すべての記録を表示（{updates.length}件）›</div>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <h3 className="panel-title">訪問予定・履歴 <small className="muted">直近の予定から緊急度順に表示</small></h3>
        <div className="table-wrap">
          <table className="table clickable">
            <thead><tr><th>訪問日</th><th>時間</th><th>医師</th><th>看護師</th><th>内容</th><th>状態</th></tr></thead>
            <tbody>
              {visits.map((v) => (
                <Fragment key={v.id}>
                  <tr onClick={() => setOpenVisit(openVisit === v.id ? null : v.id)} className={openVisit === v.id ? 'row-selected' : ''}>
                    <td className="nowrap">{fmtDate(v.date)}</td>
                    <td className="nowrap">{v.startTime}〜{v.endTime}</td>
                    <td>{userMap.get(v.doctorId)?.name ?? '—'}</td>
                    <td>{userMap.get(v.nurseId)?.name ?? '—'}</td>
                    <td>{v.urgent && <span className="urgent-tag">緊急</span>}{v.purpose}</td>
                    <td><VisitPill status={displayStatus(v, ymd(new Date()), nowHM())} /></td>
                  </tr>
                  {openVisit === v.id && (
                    <tr className="report-row">
                      <td colSpan={6}>
                        {v.status === 'completed' ? <><p className="pre">{v.report}</p><Attachments items={v.attachments} /></> : <span className="muted">訪問レポートはまだ登録されていません</span>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!visits.length && <Empty>訪問履歴はありません</Empty>}
        </div>
      </section>
      <section className="panel">
        <h3 className="panel-title"><IconMail size={16} />患者へのメール通知 <small className="muted">訪問予定の追加・変更時に {p.email} へ自動送信</small></h3>
        {!data.mailConfigured && <p className="notice-box small">メールサーバー（SMTP）が未設定のため、送信内容は記録のみ行われています。</p>}
        <ul className="mail-list">
          {data.emails.slice(0, 4).map((m) => (
            <li key={m.id}>
              <span className={`pill mail-${m.status}`}>{{ sent: '送信済み', not_configured: '記録のみ', failed: '送信失敗' }[m.status]}</span>
              <b>{m.subject}</b>
              <small className="muted">{fmtDateTime(m.createdAt)}</small>
              <details><summary>本文</summary><pre>{m.body}</pre></details>
            </li>
          ))}
          {!data.emails.length && <Empty>送信履歴はありません</Empty>}
        </ul>
      </section>
      {showAll && <AllRecordsModal updates={updates} userMap={userMap} onOpen={setRecord} onClose={() => setShowAll(false)} />}
      {record && <RecordModal u={record} author={userMap.get(record.authorId)} onClose={() => setRecord(null)} />}
    </Modal>
  );
}
