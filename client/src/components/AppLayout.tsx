import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import Avatar from './Avatar';
import { IconBell, IconBuilding, IconChat, IconDashboard, IconEdit, IconKey, IconLogout, IconMegaphone, IconPatient, IconUsers } from './Icons';
import { api, useApi } from '../api';
import { isManager, useAuth } from '../auth';
import { permissionLabel, roleLabel, statusLabel } from '@shared/labels';
import { StatusPill, useToast } from './ui';
import { DetailHost } from './DetailHost';
import Waiting from '../pages/Waiting';

interface Counts {
  unreadMessages: number;
  chatInvites: number;
  unreadBroadcasts: number;
  unreadNotices: number;
  unreadPosts: number;
  joinRequests: number;
}

function ProfileMenu() {
  const { user, unit, signOut, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const toast = useToast();
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!user) return null;
  const go = (p: string) => (setOpen(false), nav(p));
  const setStatus = async (status: 'waiting' | 'busy') => {
    try {
      setUser((await api('/auth/status', { status }, 'PUT')).user);
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };
  return (
    <div className="profile-menu" ref={ref}>
      <button className="profile-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar user={user} size={38} />
        <span className="pm-name"><b>{user.name}</b><small>{user.permission === 'manager' && user.role !== 'admin' ? '代理・' : ''}{roleLabel[user.role]}</small></span>
      </button>
      {open && (
        <div className="dropdown" role="menu">
          <div className="dd-head">
            <Avatar user={user} size={48} />
            <div>
              <b>{user.name}</b>
              <small>{user.email}</small>
              <small>{unit?.name ?? '所属ユニット未参加'}{user.permission ? `・${permissionLabel[user.permission]}` : ''}</small>
            </div>
          </div>
          {user.unitId && (
            <div className="dd-status">
              <small>現在のステータス</small>
              {user.role === 'admin' ? (
                <div className="seg seg-sm">
                  {(['waiting', 'busy'] as const).map((s) => (
                    <button key={s} className={user.status === s ? `active st-${s}` : ''} onClick={() => setStatus(s)}>{statusLabel[s]}</button>
                  ))}
                </div>
              ) : (
                <div className="dd-auto"><StatusPill status={user.status} /><small>訪問状況とログイン状態から自動で表示されます</small></div>
              )}
            </div>
          )}
          <button className="dd-item" onClick={() => go('/app/profile')}><IconEdit size={18} />プロフィール編集</button>
          {user.unitId && isManager(user) && (
            <>
              {user.role === 'admin' && <button className="dd-item" onClick={() => go('/app/unit')}><IconBuilding size={18} />所属ユニット編集</button>}
              <button className="dd-item" onClick={() => go('/app/permissions')}><IconKey size={18} />権限付与・代理指定</button>
            </>
          )}
          <button className="dd-item danger" onClick={() => (signOut(), nav('/'))}><IconLogout size={18} />ログアウト</button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, unit } = useAuth();
  const loc = useLocation();
  const { data: counts } = useApi<Counts>('/counts', ['chat', 'notices', 'broadcasts', 'team', 'posts', 'posts-seen', 'join-requests']);
  const chatCount = (counts?.unreadMessages ?? 0) + (counts?.chatInvites ?? 0);
  const bellCount = (counts?.unreadBroadcasts ?? 0) + (counts?.unreadNotices ?? 0);
  const prevChat = useRef(0);
  const [pulse, setPulse] = useState(false);
  // Show 「新着メッセージ」 when unread messages arrive; hide it as soon as they are read (count goes down).
  useEffect(() => {
    if (chatCount > prevChat.current) setPulse(true);
    else if (chatCount < prevChat.current || chatCount === 0) setPulse(false);
    prevChat.current = chatCount;
  }, [chatCount]);
  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 8000);
    return () => clearTimeout(t);
  }, [pulse]);
  useEffect(() => {
    if (loc.pathname === '/app/chat') setPulse(false);
  }, [loc.pathname]);

  const hasUnit = !!user?.unitId;
  const allowWithoutUnit = ['/app/profile', '/app/notifications'].includes(loc.pathname);

  return (
    <DetailHost>
      <div className={`app ${hasUnit ? 'with-sidebar' : ''}`}>
        <header className="topbar">
          <Logo to="/app" />
          <div className="topbar-right">
            <NavLink to="/app/notifications" className="nav-icon" aria-label="通知">
              <IconBell size={22} />
              {bellCount > 0 && <span className="badge">{bellCount > 99 ? '99+' : bellCount}</span>}
            </NavLink>
            {hasUnit && (
              <NavLink to="/app/chat" className="nav-icon" aria-label="チャット">
                <IconChat size={22} />
                {chatCount > 0 && <span className={`badge ${pulse ? 'pulse' : ''}`}>{chatCount > 99 ? '99+' : chatCount}</span>}
                {pulse && <span className="new-msg">新着メッセージ</span>}
              </NavLink>
            )}
            <ProfileMenu />
          </div>
        </header>
        {hasUnit && (
          <aside className="sidebar">
            <nav>
              <NavLink end to="/app"><IconDashboard size={20} /><span>ダッシュボード</span></NavLink>
              <NavLink to="/app/team"><IconUsers size={20} /><span>チーム</span>{(counts?.joinRequests ?? 0) > 0 && <span className="nav-count" title="承認待ちの参加申請">{counts!.joinRequests}</span>}</NavLink>
              <NavLink to="/app/patients"><IconPatient size={20} /><span>患者</span></NavLink>
              <NavLink to="/app/board"><IconMegaphone size={20} /><span>掲示板</span>{(counts?.unreadPosts ?? 0) > 0 && <span className="nav-count" title="未読の投稿">{counts!.unreadPosts}</span>}</NavLink>
              <NavLink to="/app/chat"><IconChat size={20} /><span>チャット</span>{chatCount > 0 && <span className="nav-count">{chatCount}</span>}</NavLink>
              <NavLink to="/app/notifications"><IconBell size={20} /><span>お知らせ</span>{bellCount > 0 && <span className="nav-count">{bellCount}</span>}</NavLink>
            </nav>
            <div className="sidebar-foot">
              <small>所属ユニット</small>
              <b>{unit?.name}</b>
            </div>
          </aside>
        )}
        <main className="main">{hasUnit || allowWithoutUnit ? <Outlet /> : <Waiting />}</main>
      </div>
    </DetailHost>
  );
}
