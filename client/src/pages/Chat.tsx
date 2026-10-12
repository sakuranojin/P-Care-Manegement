import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Attachment, ChatGroup, Message, PublicUser, StaffStatus } from '@shared/types';
import { ageOf, genderLabel, roleLabel, statusLabel } from '@shared/labels';
import { api, useApi } from '../api';
import { isManager, useAuth } from '../auth';
import Avatar from '../components/Avatar';
import FilePicker from '../components/FilePicker';
import { useDetails } from '../components/DetailHost';
import { IconClose, IconEdit, IconPlus, IconReply, IconSearch, IconSend, IconSmile, IconTrash, IconUserPlus } from '../components/Icons';
import { Attachments, Empty, Modal, StatusPill, useSort, useToast } from '../components/ui';

type Group = ChatGroup & { pending: boolean; lastMessage: Message | null; unread: number };

const EMOJIS = ['😀', '😄', '😊', '🙂', '😉', '😍', '🥰', '😂', '🤣', '😅', '😌', '🤔', '😮', '😢', '😭', '😥', '🙏', '👍', '👏', '🙌', '💪', '👌', '✌️', '🤝', '❤️', '💖', '✨', '🎉', '🌸', '☀️', '🍀', '☕', '🚗', '🏥', '💊', '🩺', '📋', '📅', '✅', '⚠️', '🆗', '💯'];

function MemberPicker({ team, exclude, onClose, onSubmit, withName }: {
  team: PublicUser[]; exclude: string[]; onClose: () => void; onSubmit: (ids: string[], name: string) => Promise<void>; withName?: boolean;
}) {
  const { user, unit } = useAuth();
  const [sel, setSel] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = team.filter((u) => !exclude.includes(u.id) && (!q || u.name.includes(q)));
  const { sorted, th } = useSort(rows, { name: (u) => u.name, age: (u) => ageOf(u.birthDate) ?? 0, gender: (u) => u.gender, role: (u) => u.role, status: (u) => u.status }, 'name');
  const allSelected = rows.length > 0 && rows.every((u) => sel.includes(u.id));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSel(allSelected ? sel.filter((id) => !rows.some((u) => u.id === id)) : [...new Set([...sel, ...rows.map((u) => u.id)])]);
  return (
    <Modal title={withName ? '新しいグループ' : 'メンバーを追加'} onClose={onClose} wide
      footer={<>
        <span className="muted small grow">{isManager(user) ? '管理者が追加したメンバーは承認なしですぐに参加します' : '相手が承認するとグループに参加します'}</span>
        <button className="btn btn-ghost" onClick={onClose}>キャンセル</button>
        <button className="btn btn-primary" disabled={!sel.length || busy} onClick={async () => { setBusy(true); try { await onSubmit(sel, name); } finally { setBusy(false); } }}>
          {sel.length}名で{withName ? '作成' : '追加'}
        </button>
      </>}>
      {withName && (
        <div className="field"><label>グループ名（任意）</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="例）山田様 担当チーム" /></div>
      )}
      <div className="input-icon"><IconSearch size={18} /><input placeholder="氏名で検索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="table-wrap tall">
        <table className="table clickable">
          <thead>
            <tr>
              <th className="check-col">
                <label className="select-all" title={allSelected ? 'すべて解除' : 'すべて選択'}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!rows.length} />
                  <span>{allSelected ? '全解除' : '全選択'}</span>
                </label>
              </th>
              <th>アバター</th>{th('name', '氏名')}{th('age', '年齢')}{th('gender', '性別')}{th('role', '職種')}<th>所属ユニット</th>{th('status', 'ステータス')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => (
              <tr key={u.id} onClick={() => toggle(u.id)} className={sel.includes(u.id) ? 'row-selected' : ''}>
                <td className="check-col"><input type="checkbox" checked={sel.includes(u.id)} readOnly /></td>
                <td><Avatar user={u} size={34} /></td>
                <td><b>{u.name}</b></td>
                <td>{ageOf(u.birthDate)}歳</td>
                <td>{genderLabel[u.gender]}</td>
                <td>{roleLabel[u.role]}</td>
                <td className="small">{unit?.name}</td>
                <td><StatusPill status={u.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>追加できるメンバーがいません</Empty>}
      </div>
    </Modal>
  );
}

const statusOrder: Record<StaffStatus, number> = { visiting: 0, busy: 1, waiting: 2, off: 3 };
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

export default function Chat() {
  const { user } = useAuth();
  const toast = useToast();
  const { openStaff } = useDetails();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('g');
  const { data: groups } = useApi<Group[]>('/chat/groups', ['chat']);
  const { data: team } = useApi<PublicUser[]>('/team', ['team']);
  const { data: messages } = useApi<Message[]>(activeId ? `/chat/groups/${activeId}/messages` : null, [`chat:${activeId}`]);
  const [picker, setPicker] = useState<'new' | 'add' | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userMap = new Map((team ?? []).map((u) => [u.id, u]));
  const active = groups?.find((g) => g.id === activeId && !g.pending);
  const select = (id: string) => (setParams({ g: id }), setReplyTo(null));

  const title = (g: Group) =>
    g.name || (g.direct ? [...g.memberIds, ...g.pendingIds] : g.memberIds).filter((id) => id !== user?.id).map((id) => userMap.get(id)?.name).filter(Boolean).join('、') || 'チャット';

  // Mark as read while the conversation is open → the sender sees「既読」.
  useEffect(() => {
    if (!active || !messages || !user) return;
    if (messages.some((m) => m.senderId !== user.id && !m.readBy.includes(user.id)) && document.visibilityState === 'visible') {
      api(`/chat/groups/${active.id}/read`, {}).catch(() => {});
    }
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, active?.id]);

  useEffect(() => {
    const h = () => document.visibilityState === 'visible' && active && api(`/chat/groups/${active.id}/read`, {}).catch(() => {});
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [active?.id]);

  if (!user) return null;

  const send = async () => {
    if (!active || (!text.trim() && !files.length)) return;
    try {
      await api(`/chat/groups/${active.id}/messages`, { text, attachments: files, replyTo: replyTo?.id ?? null });
      setText('');
      setFiles([]);
      setReplyTo(null);
      setEmoji(false);
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };
  const insertEmoji = (e: string) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? text.length;
    setText(text.slice(0, pos) + e + text.slice(pos));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + e.length, pos + e.length); });
  };
  const respond = async (g: Group, action: 'accept' | 'decline') => {
    try {
      await api(`/chat/groups/${g.id}/${action}`, {});
      if (action === 'accept') select(g.id);
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };
  const readLabel = (m: Message) => {
    if (!active) return '';
    const readers = m.readBy.filter((id) => id !== m.senderId).length;
    if (!readers) return '';
    return active.memberIds.length <= 2 ? '既読' : `既読 ${readers}`;
  };
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      return true;
    } catch (e: any) {
      toast(e.message, 'err');
      return false;
    }
  };
  const saveEdit = () => editing && run(() => api(`/chat/messages/${editing.id}`, { text: editing.text }, 'PUT')).then((ok) => ok && setEditing(null));
  const deleteMessage = (m: Message) => confirm('このメッセージを削除しますか？') && run(() => api(`/chat/messages/${m.id}`, undefined, 'DELETE'), 'メッセージを削除しました');
  const canManageGroup = (g: Group) => !g.direct && (g.createdBy === user.id || isManager(user));
  const removeGroup = (g: Group) => {
    const msg = g.direct ? `${title(g)}さんとの接続を解除しますか？会話履歴も削除されます。` : `グループ「${title(g)}」を削除しますか？会話履歴もすべて削除されます。`;
    if (!confirm(msg)) return;
    run(() => api(`/chat/groups/${g.id}`, undefined, 'DELETE'), g.direct ? '接続を解除しました' : 'グループを削除しました').then((ok) => ok && setParams({}));
  };
  const leaveGroup = (g: Group) =>
    confirm(`グループ「${title(g)}」から退出しますか？`) && run(() => api(`/chat/groups/${g.id}/leave`, {}), 'グループから退出しました').then((ok) => ok && setParams({}));
  const removeMember = (g: Group, m: PublicUser) =>
    confirm(`${m.name}さんをグループから外しますか？`) && run(() => api(`/chat/groups/${g.id}/remove`, { userId: m.id }), `${m.name}さんをグループから外しました`);

  const startReply = (m: Message) => {
    setReplyTo(m);
    inputRef.current?.focus();
  };

  const msgById = new Map((messages ?? []).map((m) => [m.id, m]));
  const members = active ? (active.memberIds.map((id) => userMap.get(id)).filter(Boolean) as PublicUser[]).sort((a, b) => statusOrder[a.status] - statusOrder[b.status]) : [];
  const pendingMembers = active ? (active.pendingIds.map((id) => userMap.get(id)).filter(Boolean) as PublicUser[]) : [];
  const shownGroups = (groups ?? []).filter((g) => !q || title(g).includes(q));

  let lastDay = '';
  let prev: Message | null = null;
  return (
    <div className="chat-page">
      <aside className="chat-list">
        <div className="chat-list-head">
          <h2>チャット</h2>
          <button className="btn btn-sm btn-primary" onClick={() => setPicker('new')}><IconPlus size={16} />新規</button>
        </div>
        <div className="chat-search"><IconSearch size={16} /><input placeholder="会話を検索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {!groups?.length && <Empty>まだ会話はありません。<br />「新規」からメンバーを選ぶか、チーム画面から個別チャットを始めましょう。</Empty>}
        <ul>
          {shownGroups.map((g) => {
            const others = [...g.memberIds, ...g.pendingIds].filter((id) => id !== user.id).map((id) => userMap.get(id)).filter(Boolean) as PublicUser[];
            return (
              <li key={g.id} className={`${g.id === activeId ? 'active' : ''} ${g.pending ? 'pending' : ''} ${g.unread ? 'has-unread' : ''}`} onClick={() => !g.pending && select(g.id)}>
                {g.direct && others[0] ? (
                  <span className="dm-avatar"><Avatar user={others[0]} size={36} showMark={false} /><i className={`presence st-${others[0].status}`} /></span>
                ) : (
                  <span className="group-avatar">{(g.name || '#').slice(0, 1)}</span>
                )}
                <div className="grow">
                  <b>{title(g)}</b>
                  {g.pending ? (
                    <div className="pending-actions">
                      <small>{userMap.get(g.createdBy)?.name}さんから{g.direct ? '個別チャットのリクエスト' : '参加リクエスト'}</small>
                      <button className="btn btn-xs btn-primary" onClick={(e) => { e.stopPropagation(); respond(g, 'accept'); }}>承認</button>
                      <button className="btn btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); respond(g, 'decline'); }}>拒否</button>
                    </div>
                  ) : (
                    <small className="ellipsis">{g.lastMessage ? `${g.lastMessage.senderId === user.id ? 'あなた: ' : ''}${g.lastMessage.text || '📎 添付ファイル'}` : `${g.memberIds.length}名のメンバー`}</small>
                  )}
                </div>
                {g.unread > 0 && <span className="badge static">{g.unread}</span>}
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="chat-main">
        {!active ? (
          <Empty>左の一覧から会話を選択してください</Empty>
        ) : (
          <>
            <div className="chat-head">
              <span className="hash">{active.direct ? '@' : '#'}</span>
              <b>{title(active)}</b>
              <small>{active.direct ? 'ダイレクトメッセージ' : `${active.memberIds.length}名のメンバー`}</small>
              <span className="grow" />
              <small className="muted hint-dbl">メッセージをダブルクリックで返信</small>
              {!active.direct && <button className="btn btn-sm btn-outline" onClick={() => setPicker('add')}><IconUserPlus size={16} />メンバー追加</button>}
              {active.direct && <button className="btn btn-sm btn-ghost danger" onClick={() => removeGroup(active)}>接続を解除</button>}
              {!active.direct && active.createdBy !== user.id && <button className="btn btn-sm btn-ghost" onClick={() => leaveGroup(active)}>退出</button>}
              {canManageGroup(active) && <button className="btn btn-sm btn-ghost danger" onClick={() => removeGroup(active)}><IconTrash size={15} />グループを削除</button>}
            </div>
            <div className="chat-body">
              {messages?.map((m) => {
                const s = userMap.get(m.senderId);
                const day = new Date(m.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
                const showDay = day !== lastDay;
                const grouped = !showDay && !m.replyTo && prev?.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
                lastDay = day;
                prev = m;
                const parent = m.replyTo ? msgById.get(m.replyTo) : undefined;
                const parentUser = parent ? userMap.get(parent.senderId) : undefined;
                const read = m.senderId === user.id ? readLabel(m) : '';
                return (
                  <div key={m.id}>
                    {showDay && <div className="chat-day"><span>{day}</span></div>}
                    <div className={`dmsg ${grouped ? 'grouped' : ''} ${replyTo?.id === m.id ? 'replying' : ''}`} onDoubleClick={() => editing?.id !== m.id && startReply(m)}>
                      {m.replyTo && (
                        <div className="dmsg-ref">
                          <span className="ref-line" />
                          {parent ? (
                            <>
                              {parentUser && <Avatar user={parentUser} size={16} showMark={false} />}
                              <b>@{parentUser?.name ?? '不明'}</b>
                              <span className="ref-text">{parent.text || '📎 添付ファイル'}</span>
                            </>
                          ) : <span className="ref-text deleted">削除されたメッセージ</span>}
                        </div>
                      )}
                      <div className="dmsg-row">
                        {grouped ? <span className="dmsg-gutter">{clock(m.createdAt)}</span> : (
                          <button className="dmsg-avatar" onClick={() => s && openStaff(s.id)}>{s ? <Avatar user={s} size={40} /> : <span className="avatar-img" />}</button>
                        )}
                        <div className="dmsg-content">
                          {!grouped && (
                            <div className="dmsg-head">
                              <b className={`name-${s?.role ?? 'x'}`}>{s?.name ?? '退出したメンバー'}</b>
                              <small>{clock(m.createdAt)}</small>
                            </div>
                          )}
                          {editing?.id === m.id ? (
                            <div className="msg-edit">
                              <textarea autoFocus rows={2} value={editing.text} onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); saveEdit(); }
                                  if (e.key === 'Escape') setEditing(null);
                                }} />
                              <small>Escで<button className="link-like" onClick={() => setEditing(null)}>キャンセル</button>・Enterで<button className="link-like" onClick={saveEdit}>保存</button></small>
                            </div>
                          ) : (
                            m.text && <p className="pre">{m.text}{m.editedAt && <span className="edited">（編集済み）</span>}</p>
                          )}
                          <Attachments items={m.attachments} />
                          {read && <span className="read">{read}</span>}
                        </div>
                        <div className="dmsg-actions">
                          <button title="返信" onClick={() => startReply(m)}><IconReply size={16} /></button>
                          {m.senderId === user.id && (
                            <>
                              <button title="編集" onClick={() => setEditing({ id: m.id, text: m.text })}><IconEdit size={15} /></button>
                              <button title="削除" className="danger" onClick={() => deleteMessage(m)}><IconTrash size={15} /></button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages && !messages.length && <Empty>メッセージを送って会話を始めましょう</Empty>}
              <div ref={endRef} />
            </div>
            {active.direct && active.pendingIds.length > 0 ? (
              <div className="chat-compose">
                <div className="pending-banner">
                  ⏳ {title(active)}さんの承認待ちです。承認されるとメッセージを送信できます。
                  <button className="btn btn-xs btn-ghost" onClick={() => removeGroup(active)}>リクエストを取り消す</button>
                </div>
              </div>
            ) : (
            <div className="chat-compose">
              {replyTo && (
                <div className="reply-bar">
                  <IconReply size={14} /><span><b>{userMap.get(replyTo.senderId)?.name}</b> に返信中</span>
                  <span className="ref-text">{replyTo.text || '📎 添付ファイル'}</span>
                  <button onClick={() => setReplyTo(null)} aria-label="返信をやめる"><IconClose size={14} /></button>
                </div>
              )}
              {files.length > 0 && <FilePicker value={files} onChange={setFiles} label="追加" />}
              <div className="chat-input">
                {!files.length && <FilePicker value={files} onChange={setFiles} label="" />}
                <textarea ref={inputRef} rows={1} value={text} placeholder={`${title(active)} へメッセージを送信（Enterで送信・Shift+Enterで改行）`}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                    if (e.key === 'Escape') setReplyTo(null);
                  }} />
                <div className="emoji-wrap">
                  <button className={`icon-btn ${emoji ? 'on' : ''}`} onClick={() => setEmoji(!emoji)} aria-label="絵文字"><IconSmile size={22} /></button>
                  {emoji && (
                    <div className="emoji-pop">
                      {EMOJIS.map((e) => <button key={e} onClick={() => insertEmoji(e)}>{e}</button>)}
                    </div>
                  )}
                </div>
                <button className="send-btn" onClick={send} disabled={!text.trim() && !files.length} aria-label="送信"><IconSend size={18} /></button>
              </div>
            </div>
            )}
          </>
        )}
      </section>

      {active && (
        <aside className="chat-members">
          <h3>メンバー — {members.length}</h3>
          {(['visiting', 'busy', 'waiting', 'off'] as StaffStatus[]).map((st) => {
            const list = members.filter((m) => m.status === st);
            if (!list.length) return null;
            return (
              <div key={st}>
                <small className={`mem-group st-${st}`}>{statusLabel[st]} — {list.length}</small>
                <ul>
                  {list.map((m) => (
                    <li key={m.id} className={`st-${m.status}`} onClick={() => openStaff(m.id)}>
                      <span className="dm-avatar"><Avatar user={m} size={32} /><i className={`presence st-${m.status}`} /></span>
                      <span className="grow"><b>{m.name}{m.id === user.id && <small>（あなた）</small>}</b><small>{roleLabel[m.role]}・{statusLabel[m.status]}</small></span>
                      {canManageGroup(active) && m.id !== user.id && (
                        <button className="mem-remove" title="グループから外す" onClick={(e) => { e.stopPropagation(); removeMember(active, m); }}><IconClose size={14} /></button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {pendingMembers.length > 0 && (
            <div>
              <small className="mem-group">承認待ち — {pendingMembers.length}</small>
              <ul>{pendingMembers.map((m) => <li key={m.id} className="pending"><Avatar user={m} size={32} /><span className="grow"><b>{m.name}</b></span></li>)}</ul>
            </div>
          )}
        </aside>
      )}

      {picker && team && (
        <MemberPicker team={team.filter((u) => u.id !== user.id)} withName={picker === 'new'}
          exclude={picker === 'add' && active ? [...active.memberIds, ...active.pendingIds] : []}
          onClose={() => setPicker(null)}
          onSubmit={async (ids, name) => {
            try {
              if (picker === 'new') {
                const g = await api<Group>('/chat/groups', { memberIds: ids, name });
                select(g.id);
              } else if (active) {
                await api(`/chat/groups/${active.id}/members`, { memberIds: ids });
              }
              toast(isManager(user) ? 'メンバーを追加しました' : '参加リクエストを送信しました');
              setPicker(null);
            } catch (e: any) {
              toast(e.message, 'err');
            }
          }} />
      )}
    </div>
  );
}
