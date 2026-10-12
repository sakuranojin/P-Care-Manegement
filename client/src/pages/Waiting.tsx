import { useState } from 'react';
import type { Invitation, JoinRequest, PublicUser, Unit } from '@shared/types';
import { roleLabel } from '@shared/labels';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import Avatar from '../components/Avatar';
import { IconBuilding, IconMail, IconSearch, IconShield } from '../components/Icons';
import { Empty, fmtDateTime, useToast } from '../components/ui';

type Inv = Invitation & { unit: Unit; inviter: PublicUser };
interface Mine { pending: JoinRequest | null; cancelled: JoinRequest | null; units: Record<string, string> }
interface UnitHit { id: string; name: string; address: string; members: number }

/** Shown to signed-up users who are not yet in a unit: they cannot see any unit data. */
export default function Waiting() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const { data: invites, reload } = useApi<Inv[]>('/invitations/mine', ['invitations', 'notices']);
  const { data: mine, reload: reloadMine } = useApi<Mine>('/join-requests/mine', ['join-requests', 'notices']);
  const [q, setQ] = useState('');
  const { data: units } = useApi<UnitHit[]>(`/units/search?q=${encodeURIComponent(q)}`, ['join-requests']);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      reload();
      reloadMine();
      await refresh();
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const canCreate = user.role === 'admin' && !user.createdUnit;
  const pending = mine?.pending;

  return (
    <div className="container narrow">
      <div className="welcome card">
        <Avatar user={user} size={64} />
        <div>
          <h1>ようこそ、{user.name}さん</h1>
          <p className="muted">
            {roleLabel[user.role]}としてアカウント登録が完了しました。
            {canCreate ? '所属ユニットを作成するか、既存のユニットに参加を申請してください。' : '参加したい所属ユニットを検索して参加申請を送信してください。管理者が承認すると情報にアクセスできるようになります。'}
          </p>
        </div>
      </div>

      {mine?.cancelled && !pending && (
        <p className="notice-box warn">
          「{mine.units[mine.cancelled.unitId] ?? '所属ユニット'}」への参加申請はキャンセルされました（{fmtDateTime(mine.cancelled.decidedAt ?? mine.cancelled.createdAt)}）。
          下の検索から別の所属ユニットを選んで、改めて申請してください。
        </p>
      )}

      <section className="card">
        <h2 className="card-title"><IconBuilding />所属ユニットに参加申請</h2>
        {pending ? (
          <div className="request-card">
            <div className="grow">
              <small className="muted">申請中</small>
              <b>{mine?.units[pending.unitId]}</b>
              <small className="muted">{fmtDateTime(pending.createdAt)} に申請・管理者の承認待ちです</small>
            </div>
            <button className="btn btn-ghost danger" disabled={busy} onClick={() => confirm('この参加申請を取り消しますか？') && run(() => api(`/join-requests/${pending.id}/withdraw`, {}), '参加申請を取り消しました')}>申請を取り消す</button>
          </div>
        ) : (
          <>
            <div className="input-icon"><IconSearch size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ユニット名・住所で検索（例：さくら、世田谷区）" /></div>
            <ul className="unit-list">
              {units?.map((u) => (
                <li key={u.id}>
                  <span className="unit-icon"><IconBuilding size={20} /></span>
                  <div className="grow"><b>{u.name}</b><small className="muted">{u.address}・メンバー {u.members}名</small></div>
                  <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => api('/join-requests', { unitId: u.id }), `「${u.name}」に参加申請を送信しました`)}>参加を申請</button>
                </li>
              ))}
              {units && !units.length && <Empty>該当する所属ユニットがありません</Empty>}
            </ul>
          </>
        )}
      </section>

      {canCreate && (
        <section className="card">
          <h2 className="card-title"><IconBuilding />所属ユニットを作成</h2>
          <p className="muted small">クリニック・訪問看護ステーションなどの単位です。所属ユニットは管理者のみ、<b>1回だけ</b>作成できます。</p>
          <div className="field">
            <label>ユニット名 <em>必須</em></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例）さくら在宅ケアクリニック" />
          </div>
          <div className="field">
            <label>住所 <em>必須</em></label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="例）東京都世田谷区三軒茶屋2-14-8" />
          </div>
          <button className="btn btn-primary" onClick={() => run(() => api('/units', { name, address }), '所属ユニットを作成しました')} disabled={busy || !name.trim() || !address.trim()}>作成する</button>
        </section>
      )}

      <section className="card">
        <h2 className="card-title"><IconMail />届いている招待</h2>
        {!invites?.length ? (
          <Empty>現在、届いている招待はありません。</Empty>
        ) : (
          <ul className="invite-list">
            {invites.map((i) => (
              <li key={i.id}>
                <Avatar user={i.inviter} size={44} />
                <div className="grow">
                  <b>{i.unit.name}</b>
                  <small>{i.unit.address}</small>
                  <small>招待者: {i.inviter.name}・{fmtDateTime(i.createdAt)}</small>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => run(() => api(`/invitations/${i.id}/accept`, {}), 'ユニットに参加しました')}>承認して参加</button>
                <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/invitations/${i.id}/decline`, {}), '招待を辞退しました')}>辞退</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="notice-box"><IconShield size={18} />個人情報保護のため、所属ユニットに参加するまで患者情報・スケジュール・チーム情報は表示されません。</p>
    </div>
  );
}
