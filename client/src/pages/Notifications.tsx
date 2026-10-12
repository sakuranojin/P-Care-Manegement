import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Broadcast, Notice, PublicUser } from '@shared/types';
import { api, useApi } from '../api';
import { isManager, useAuth } from '../auth';
import Avatar from '../components/Avatar';
import { LogoMark } from '../components/Logo';
import { IconMegaphone } from '../components/Icons';
import { Empty, Tabs, fmtDateTime, useToast } from '../components/ui';
import { useDetails } from '../components/DetailHost';

/**
 * Notifications: each item is marked read individually when opened (it turns gray and only
 * that item stops counting as new). "すべて既読" is available for bulk clearing.
 */
export default function Notifications() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { openPatient, openVisit } = useDetails();
  const hasUnit = !!user?.unitId;
  const [tab, setTab] = useState<'personal' | 'broadcast'>('personal');
  const { data: broadcasts } = useApi<Broadcast[]>(hasUnit ? '/broadcasts' : null, ['broadcasts']);
  const { data: notices } = useApi<Notice[]>('/notices', ['notices']);
  const { data: team } = useApi<PublicUser[]>(hasUnit ? '/team' : null, ['team']);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const userMap = new Map((team ?? []).map((u) => [u.id, u]));
  if (!user) return null;

  const send = async () => {
    setBusy(true);
    try {
      await api('/broadcasts', { title, body });
      setTitle('');
      setBody('');
      toast('お知らせを全員に送信しました');
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const openNotice = (n: Notice) => {
    if (!n.read) api(`/notices/${n.id}/read`, {}).catch(() => {});
    if (n.link.startsWith('patient:')) openPatient(n.link.slice(8));
    else if (n.link.startsWith('visit:')) openVisit(n.link.slice(6));
    else if (n.link) nav(n.link);
  };
  const openBroadcast = (b: Broadcast) => {
    setOpen(open === b.id ? null : b.id);
    if (!b.readBy.includes(user.id)) api(`/broadcasts/${b.id}/read`, {}).catch(() => {});
  };

  const unreadB = broadcasts?.filter((b) => !b.readBy.includes(user.id)).length ?? 0;
  const unreadN = notices?.filter((n) => !n.read).length ?? 0;

  return (
    <div className="container narrow">
      <div className="page-head">
        <div><h1>通知</h1><p className="muted">未読の通知は白、既読になった通知はグレーで表示されます。</p></div>
        {tab === 'personal' && unreadN > 0 && <button className="btn btn-sm btn-outline" onClick={() => api('/notices/read-all', {})}>すべて既読にする</button>}
        {tab === 'broadcast' && unreadB > 0 && <button className="btn btn-sm btn-outline" onClick={() => api('/broadcasts/read-all', {})}>すべて既読にする</button>}
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'personal' as const, label: <>あなたへの通知{unreadN > 0 && <span className="nav-count">{unreadN}</span>}</> },
        ...(hasUnit ? [{ value: 'broadcast' as const, label: <>全体のお知らせ{unreadB > 0 && <span className="nav-count">{unreadB}</span>}</> }] : []),
      ]} />

      {tab === 'personal' && (
        <ul className="notice-list cards">
          {notices?.map((n) => {
            const from = n.fromId && n.fromId !== 'system' ? userMap.get(n.fromId) : undefined;
            return (
              <li key={n.id} className={`${n.read ? 'read' : 'unread'} nk-${n.kind}`} onClick={() => openNotice(n)} role="button" tabIndex={0}>
                <span className="notice-from">
                  {n.fromId === 'system' ? <span className="system-avatar" title="システム"><LogoMark size={36} /></span>
                    : from ? <Avatar user={from} size={36} /> : <span className={`nk-dot nk-${n.kind}`} />}
                </span>
                <div className="grow">
                  <small className="notice-meta">
                    {n.fromId === 'system' ? 'システム' : from?.name ?? '通知'}・{fmtDateTime(n.createdAt)}
                    {n.kind === 'urgent' && <span className="urgent-tag">緊急</span>}
                  </small>
                  <p className="pre">{n.text}</p>
                </div>
                {!n.read && <span className="new-tag">未読</span>}
              </li>
            );
          })}
          {notices && !notices.length && <Empty>通知はありません</Empty>}
        </ul>
      )}

      {tab === 'broadcast' && hasUnit && (
        <>
          {isManager(user) ? (
            <section className="card compose">
              <h2 className="card-title"><IconMegaphone />全員にお知らせを送信</h2>
              <div className="field"><label>件名</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例）【重要】年末年始の訪問体制について" /></div>
              <div className="field"><label>本文</label><textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></div>
              <div className="row-end"><button className="btn btn-primary" disabled={busy || !title.trim() || !body.trim()} onClick={send}>送信する</button></div>
            </section>
          ) : (
            <p className="notice-box">お知らせの送信は管理者権限を持つユーザーのみ可能です。あなたは閲覧のみできます。</p>
          )}
          <ul className="notice-list cards">
            {broadcasts?.map((b) => {
              const a = userMap.get(b.authorId);
              const read = b.readBy.includes(user.id);
              return (
                <li key={b.id} className={read ? 'read' : 'unread'} onClick={() => openBroadcast(b)} role="button" tabIndex={0}>
                  <span className="notice-from">{a && <Avatar user={a} size={36} />}</span>
                  <div className="grow">
                    <small className="notice-meta">{a?.name}・{fmtDateTime(b.createdAt)}</small>
                    <b>{b.title}</b>
                    <p className={`pre ${open === b.id ? '' : 'clamp one'}`}>{b.body}</p>
                  </div>
                  {!read && <span className="new-tag">未読</span>}
                </li>
              );
            })}
            {broadcasts && !broadcasts.length && <Empty>お知らせはまだありません</Empty>}
          </ul>
        </>
      )}
    </div>
  );
}
