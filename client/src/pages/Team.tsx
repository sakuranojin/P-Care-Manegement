import { useState } from 'react';
import type { Invitation, JoinRequest, Patient, PublicUser } from '@shared/types';
import { ageOf, genderLabel, permissionLabel, roleLabel } from '@shared/labels';
import { api, useApi } from '../api';
import { isManager, seesAll, useAuth } from '../auth';
import Avatar from '../components/Avatar';
import { IconMail, IconSearch, IconUserPlus } from '../components/Icons';
import { Empty, Modal, StatusPill, Tabs, fmtDateTime, useSort, useToast } from '../components/ui';
import { useDetails } from '../components/DetailHost';

type Candidate = PublicUser & { hasUnit: boolean; invited: boolean };
type Sent = Invitation & { invitee: PublicUser };

type Req = JoinRequest & { user: PublicUser };

/** Pending membership requests for this unit: approve to add, or cancel (the registrant is told to apply elsewhere). */
function JoinRequests() {
  const toast = useToast();
  const { data: reqs } = useApi<Req[]>('/join-requests', ['join-requests']);
  const act = async (r: Req, action: 'approve' | 'cancel') => {
    if (action === 'cancel' && !confirm(`${r.user.name}さんの参加申請をキャンセルしますか？申請者に通知されます。`)) return;
    try {
      await api(`/join-requests/${r.id}/${action}`, {});
      toast(action === 'approve' ? `${r.user.name}さんがユニットに参加しました` : '参加申請をキャンセルし、申請者に通知しました');
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };
  if (reqs && !reqs.length) return <Empty>現在、承認待ちの参加申請はありません</Empty>;
  return (
    <ul className="invite-list">
      {reqs?.map((r) => (
        <li key={r.id}>
          <Avatar user={r.user} size={44} />
          <div className="grow">
            <b>{r.user.name} <span className={`role-tag rt-${r.user.role}`}>{roleLabel[r.user.role]}</span></b>
            <small>{r.user.email}・{genderLabel[r.user.gender]}・{ageOf(r.user.birthDate)}歳・{r.user.phone}</small>
            <small>{fmtDateTime(r.createdAt)} に申請</small>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => act(r, 'approve')}>承認して追加</button>
          <button className="btn btn-ghost btn-sm danger" onClick={() => act(r, 'cancel')}>キャンセル</button>
        </li>
      ))}
    </ul>
  );
}

function AddMemberModal({ onClose, requests }: { onClose: () => void; requests: number }) {
  const [tab, setTab] = useState<'requests' | 'invite'>(requests > 0 ? 'requests' : 'invite');
  return (
    <Modal title="メンバーを追加" onClose={onClose} wide>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'requests', label: <>参加申請{requests > 0 && <span className="nav-count">{requests}</span>}</> },
        { value: 'invite', label: 'メールで招待' },
      ]} />
      <div className="tab-body">{tab === 'requests' ? <JoinRequests /> : <InviteForm />}</div>
    </Modal>
  );
}

function InviteForm() {
  const [q, setQ] = useState('');
  const [email, setEmail] = useState('');
  const toast = useToast();
  const { data: cands, reload } = useApi<Candidate[]>(`/invitations/candidates?q=${encodeURIComponent(q)}`, ['team', 'invitations']);
  const { data: sent, reload: reloadSent } = useApi<Sent[]>('/invitations/sent', ['team', 'invitations']);
  const send = async (addr: string) => {
    try {
      const r = await api<{ emailed: boolean }>('/invitations', { email: addr });
      toast(r.emailed ? '招待メールを送信しました' : '招待を送信しました（相手の通知に届きます）');
      setEmail('');
      reload();
      reloadSent();
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };
  const stLabel = { pending: '承認待ち', accepted: '参加済み', declined: '辞退' };
  return (
    <>
      <p className="muted small">P-CARE-MANAGEMENT に登録済みで、まだ他の所属ユニットに参加していないユーザーを招待できます。相手が承認するとユニットに追加されます。</p>
      <div className="invite-direct">
        <div className="input-icon"><IconMail size={18} /><input type="email" placeholder="招待するメールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={!email.trim()} onClick={() => send(email.trim())}>招待を送信</button>
      </div>
      <h4 className="sub-title">登録済みユーザーから探す</h4>
      <div className="input-icon"><IconSearch size={18} /><input placeholder="氏名・メールアドレスで検索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="table-wrap tall">
        <table className="table">
          <thead><tr><th></th><th>氏名</th><th>メールアドレス</th><th>職種</th><th>年齢</th><th></th></tr></thead>
          <tbody>
            {(cands ?? []).map((c) => (
              <tr key={c.id}>
                <td><Avatar user={c} size={32} /></td>
                <td><b>{c.name}</b></td>
                <td>{c.email}</td>
                <td>{roleLabel[c.role]}</td>
                <td>{ageOf(c.birthDate)}歳</td>
                <td className="right">
                  {c.hasUnit ? <span className="muted small" title="既に他の所属ユニットに参加しているため招待できません">他ユニット所属のため招待不可</span>
                    : c.invited ? <span className="pill pill-v-scheduled">招待済み</span>
                    : <button className="btn btn-sm btn-outline" onClick={() => send(c.email)}>招待する</button>}
                </td>
              </tr>
            ))}
            {cands && !cands.length && <tr><td colSpan={6}><Empty>該当するユーザーがいません</Empty></td></tr>}
          </tbody>
        </table>
      </div>
      {!!sent?.length && (
        <>
          <h4 className="sub-title">送信済みの招待</h4>
          <ul className="sent-list">
            {sent.map((s) => (
              <li key={s.id}><Avatar user={s.invitee} size={26} /> {s.invitee.name}<small>{s.invitee.email}</small><span className={`pill pill-inv-${s.status}`}>{stLabel[s.status]}</span><small>{fmtDateTime(s.createdAt)}</small></li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default function Team() {
  const { user } = useAuth();
  const { data: team } = useApi<PublicUser[]>('/team', ['team']);
  const { data: counts } = useApi<{ joinRequests: number }>('/counts', ['join-requests', 'team']);
  const requests = counts?.joinRequests ?? 0;
  const [filter, setFilter] = useState<'all' | 'nurse' | 'doctor'>('all');
  const [inviting, setInviting] = useState(false);
  const [q, setQ] = useState('');
  const { openStaff } = useDetails();
  // Assigned-patient counts are shown to administrator-level users only.
  const admin = seesAll(user);
  const { data: patients } = useApi<Patient[]>(admin ? '/patients' : null, ['patients']);
  const assignedCount = (id: string) => (patients ?? []).filter((p) => p.doctorIds.includes(id) || p.nurseIds.includes(id)).length;
  // The signed-in user is not listed.
  const others = (team ?? []).filter((u) => u.id !== user?.id);
  const rows = others.filter((u) => (filter === 'all' || u.role === filter) && (!q || u.name.includes(q) || (u.jobTitle ?? '').includes(q)));
  const statusOrder = { visiting: 0, busy: 1, waiting: 2, off: 3 };
  const { sorted, th } = useSort(rows, {
    name: (u) => u.name,
    gender: (u) => u.gender,
    age: (u) => ageOf(u.birthDate) ?? 0,
    role: (u) => u.role,
    status: (u) => statusOrder[u.status],
    patients: (u) => assignedCount(u.id),
  }, 'role');
  const count = (r: string) => others.filter((u) => r === 'all' || u.role === r).length;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>チーム</h1>
          <p className="muted">メンバーをクリックすると詳細を表示し、チャットや個別通知を送れます。</p>
        </div>
        {isManager(user) && (
          <button className="btn btn-primary add-btn" onClick={() => setInviting(true)} title={requests ? `承認待ちの参加申請 ${requests}件` : ''}>
            <IconUserPlus size={18} />追加
            {requests > 0 && <span className="btn-badge">{requests}</span>}
          </button>
        )}
      </div>
      <section className="card">
        <div className="section-head">
          <Tabs value={filter} onChange={setFilter} items={[
            { value: 'all', label: `すべて ${count('all')}` },
            { value: 'nurse', label: `看護師 ${count('nurse')}` },
            { value: 'doctor', label: `医師 ${count('doctor')}` },
          ]} />
          <div className="input-icon search"><IconSearch size={18} /><input placeholder="医師・看護師を名前で検索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="legend"><StatusPill status="visiting" /><StatusPill status="waiting" /><StatusPill status="off" /></div>
        </div>
        <div className="table-wrap">
          <table className="table clickable">
            <thead>
              <tr><th>アバター</th>{th('name', '氏名')}{th('gender', '性別')}{th('age', '年齢')}{th('role', '職種')}<th>権限</th>{admin && th('patients', '担当患者数')}{th('status', '現在のステータス')}</tr>
            </thead>
            <tbody>
              {sorted.map((u) => (
                <tr key={u.id} onClick={() => openStaff(u.id)} title="クリックで詳細を表示">
                  <td><Avatar user={u} size={40} /></td>
                  <td><b>{u.name}</b><small className="block muted">{u.jobTitle}</small></td>
                  <td>{genderLabel[u.gender]}</td>
                  <td>{ageOf(u.birthDate)}歳</td>
                  <td><span className={`role-tag rt-${u.role}`}>{roleLabel[u.role]}</span></td>
                  <td className="small">{u.permission && permissionLabel[u.permission]}</td>
                  {admin && <td>{u.role === 'admin' ? '—' : <b className="count-pill">{assignedCount(u.id)}名</b>}</td>}
                  <td><StatusPill status={u.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {team && !sorted.length && <Empty>該当するメンバーがいません</Empty>}
        </div>
      </section>
      {inviting && <AddMemberModal requests={requests} onClose={() => setInviting(false)} />}
    </div>
  );
}
