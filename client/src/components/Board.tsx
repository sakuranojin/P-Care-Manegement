import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment, Post, PostIdentity, PostReply, PublicUser } from '@shared/types';
import { roleLabel } from '@shared/labels';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import Avatar from './Avatar';
import FilePicker from './FilePicker';
import { IconChat, IconFile, IconHeartFill, IconSend, IconTrash } from './Icons';
import { Empty, fileKind, fmtSize, useFileViewer, useToast, ymd } from './ui';

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const key = ymd(d);
  const today = new Date();
  if (key === ymd(today)) return '今日';
  if (key === ymd(new Date(Date.now() - 86400_000))) return '昨日';
  return `${d.getFullYear() !== today.getFullYear() ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

/** Who wrote it, as shown to the viewer (nickname/anonymous posts reveal nothing identifying). */
function Author({ x, userMap, size }: { x: Post | PostReply; userMap: Map<string, PublicUser>; size: number }) {
  const u = x.authorId ? userMap.get(x.authorId) : undefined;
  if (x.identity === 'real' && u) return <><Avatar user={u} size={size} showMark={size > 30} /><span className="who"><b>{u.name}</b>{size > 30 && <small>{roleLabel[u.role]}</small>}</span></>;
  const anon = x.identity === 'anonymous';
  return (
    <>
      <span className={`anon-avatar ${anon ? 'anon' : 'nick'}`} style={{ width: size, height: size }}>{anon ? '?' : (x.nickname || '?').slice(0, 1)}</span>
      <span className="who"><b>{anon ? '匿名' : x.nickname}</b>{size > 30 && <small>{anon ? '匿名で投稿' : 'ニックネーム'}</small>}</span>
    </>
  );
}

/** Choose how you appear: real name, a nickname, or fully anonymous. */
function IdentityPicker({ identity, nickname, onChange, compact }: { identity: PostIdentity; nickname: string; onChange: (i: PostIdentity, n: string) => void; compact?: boolean }) {
  return (
    <div className={`identity ${compact ? 'compact' : ''}`}>
      <div className="seg seg-sm">
        {([['real', '実名'], ['nickname', 'ニックネーム'], ['anonymous', '匿名']] as const).map(([v, l]) => (
          <button type="button" key={v} className={identity === v ? 'active' : ''} onClick={() => onChange(v, nickname)}>{l}</button>
        ))}
      </div>
      {identity === 'nickname' && <input className="nick-input" value={nickname} maxLength={20} onChange={(e) => onChange(identity, e.target.value)} placeholder="ニックネーム" />}
    </div>
  );
}

/** Reports posts as seen once at least half of them has been on screen (drives the 掲示板 badge). */
function useSeenTracker() {
  const pending = useRef(new Set<string>());
  const timer = useRef<number>();
  const observer = useRef<IntersectionObserver>();
  useEffect(() => {
    observer.current = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.postId;
        if (e.isIntersecting && id) {
          pending.current.add(id);
          observer.current?.unobserve(e.target);
        }
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const ids = [...pending.current];
        pending.current.clear();
        if (ids.length) api('/posts/seen', { ids }).catch(() => {});
      }, 600);
    }, { threshold: 0.5 });
    return () => observer.current?.disconnect();
  }, []);
  return useCallback((el: HTMLElement | null) => {
    if (el) observer.current?.observe(el);
  }, []);
}

function PostCard({ post, userMap, track }: { post: Post; userMap: Map<string, PublicUser>; track?: (el: HTMLElement | null) => void }) {
  const { user } = useAuth();
  const isNew = !!user && !post.mine && !(post.seenBy ?? []).includes(user.id);
  const toast = useToast();
  const view = useFileViewer();
  const [showReplies, setShowReplies] = useState(false);
  const [reply, setReply] = useState('');
  const [who, setWho] = useState<{ identity: PostIdentity; nickname: string }>({ identity: 'real', nickname: '' });
  const liked = !!user && post.likes.includes(user.id);
  const image = post.attachments.find((a) => fileKind(a) === 'image');
  const others = post.attachments.filter((a) => a !== image);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };
  const sendReply = () => run(async () => {
    await api(`/posts/${post.id}/replies`, { text: reply, ...who });
    setReply('');
  });

  return (
    <article className={`post ${isNew ? 'is-new' : ''}`} ref={isNew ? track : undefined} data-post-id={post.id}>
      <header className="post-head">
        <Author x={post} userMap={userMap} size={38} />
        {isNew && <span className="new-tag">NEW</span>}
        <small className="post-time">{time(post.createdAt)}</small>
        {post.mine && (
          <button className="icon-btn" title="削除" onClick={() => confirm('この投稿を削除しますか？') && run(() => api(`/posts/${post.id}`, undefined, 'DELETE'))}>
            <IconTrash size={16} />
          </button>
        )}
      </header>
      <div className={`post-body ${image ? 'has-image' : ''}`}>
        {image && <button className="post-image" onClick={() => view(image)}><img src={image.url} alt={image.name} /></button>}
        <div className="grow">
          {post.text && <p className="pre">{post.text}</p>}
          {others.length > 0 && (
            <div className="post-files">
              {others.map((a) => (
                <button key={a.url} className="file-card" onClick={() => view(a)}>
                  {fileKind(a) === 'image' ? <img src={a.url} alt="" /> : <span className="file-ext">{(a.name.split('.').pop() ?? '').toUpperCase().slice(0, 4) || <IconFile size={18} />}</span>}
                  <span className="grow"><b>{a.name}</b><small>{fmtSize(a.size)}・クリックで表示</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <footer className="post-foot">
        <button className={`like-btn ${liked ? 'liked' : ''}`} onClick={() => run(() => api(`/posts/${post.id}/like`, {}))} aria-pressed={liked}>
          <IconHeartFill size={18} filled={liked} /><span>{post.likes.length}</span>
        </button>
        <button className={`reply-btn ${showReplies ? 'on' : ''}`} onClick={() => setShowReplies(!showReplies)}>
          <IconChat size={17} /><span>返信 {post.replies.length}</span>
        </button>
      </footer>
      {showReplies && (
        <div className="post-replies">
          {post.replies.map((r) => (
            <div key={r.id} className="post-reply">
              <Author x={r} userMap={userMap} size={26} />
              <div className="grow">
                <small>{dayLabel(r.createdAt)} {time(r.createdAt)}</small>
                <p className="pre">{r.text}</p>
              </div>
              {r.mine && <button className="icon-btn sm" title="削除" onClick={() => run(() => api(`/posts/${post.id}/replies/${r.id}`, undefined, 'DELETE'))}><IconTrash size={14} /></button>}
            </div>
          ))}
          <IdentityPicker compact identity={who.identity} nickname={who.nickname} onChange={(identity, nickname) => setWho({ identity, nickname })} />
          <div className="reply-input">
            <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="返信を書く…" onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && reply.trim() && sendReply()} />
            <button className="btn btn-sm btn-primary" disabled={!reply.trim()} onClick={sendReply}><IconSend size={14} /></button>
          </div>
        </div>
      )}
    </article>
  );
}

/** 掲示板: a shared discussion board (not a chat) with files, likes, replies and optional anonymity. */
export default function Board({ team }: { team: PublicUser[] }) {
  const toast = useToast();
  const { data: posts } = useApi<Post[]>('/posts', ['posts']);
  const track = useSeenTracker();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [who, setWho] = useState<{ identity: PostIdentity; nickname: string }>({ identity: 'real', nickname: '' });
  const [busy, setBusy] = useState(false);
  const userMap = new Map(team.map((u) => [u.id, u]));

  const submit = async () => {
    setBusy(true);
    try {
      await api('/posts', { text, attachments: files, ...who });
      setText('');
      setFiles([]);
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const groups: { label: string; items: Post[] }[] = [];
  for (const p of posts ?? []) {
    const label = dayLabel(p.createdAt);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(p);
    else groups.push({ label, items: [p] });
  }

  return (
    <div className="board">
      <section className="card composer-card">
        <div className="composer">
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="気づいたこと・改善提案・共有したい資料などを投稿しましょう" />
          <div className="row-between">
            <div className="composer-left">
              <FilePicker value={files} onChange={setFiles} label="ファイル・画像を添付" />
              <IdentityPicker identity={who.identity} nickname={who.nickname} onChange={(identity, nickname) => setWho({ identity, nickname })} />
            </div>
            <button className="btn btn-primary" disabled={busy || (!text.trim() && !files.length) || (who.identity === 'nickname' && !who.nickname.trim())} onClick={submit}>投稿する</button>
          </div>
          {who.identity !== 'real' && <small className="hint">{who.identity === 'anonymous' ? 'アバター・氏名・職種は表示されません。' : 'アバター・氏名・職種の代わりにニックネームが表示されます。'}削除は投稿者本人のみ可能です。</small>}
        </div>
      </section>
      {groups.map((g) => (
        <div key={g.label} className="post-day">
          <div className="day-sep"><span>{g.label}</span></div>
          {g.items.map((p) => <PostCard key={p.id} post={p} userMap={userMap} track={track} />)}
        </div>
      ))}
      {posts && !posts.length && <Empty>まだ投稿はありません</Empty>}
    </div>
  );
}
