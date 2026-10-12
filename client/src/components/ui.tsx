import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Attachment, StaffStatus, VisitStatus } from '@shared/types';
import { displayStatus, displayStatusLabel, statusLabel, type DisplayStatus } from '@shared/labels';
import { IconClose, IconFile } from './Icons';

// ---------- Toasts ----------
type Toast = { id: number; text: string; kind: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Modal ----------
// Modals can stack (e.g. visit → patient → large record); Escape closes only the top one.
const modalStack: number[] = [];
let modalSeq = 0;
export function Modal({ title, onClose, children, wide, size, footer }: {
  title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; size?: 'sm' | 'wide' | 'xl'; footer?: ReactNode;
}) {
  const [id] = useState(() => ++modalSeq);
  useEffect(() => {
    modalStack.push(id);
    const h = (e: KeyboardEvent) => e.key === 'Escape' && modalStack[modalStack.length - 1] === id && onClose();
    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('keydown', h);
      modalStack.splice(modalStack.indexOf(id), 1);
    };
  }, [onClose, id]);
  const cls = size ? `modal-${size}` : wide ? 'modal-wide' : '';
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${cls}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる"><IconClose /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Badges ----------
/** 訪問中 = blue, 待機中 = green, 退勤 = gray, 取込中 (admins only) = orange. */
export function StatusPill({ status }: { status: StaffStatus }) {
  return <span className={`pill pill-st-${status}`}><i className="dot" />{statusLabel[status]}</span>;
}
export function VisitPill({ status }: { status: DisplayStatus }) {
  return <span className={`pill pill-v-${status}`}>{displayStatusLabel[status]}</span>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} className={value === i.value ? 'active' : ''} onClick={() => onChange(i.value)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ---------- File viewer: files open in an overlay with a download button ----------
type FileKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other';
export function fileKind(a: Attachment): FileKind {
  const ext = a.name.split('.').pop()?.toLowerCase() ?? '';
  if (a.type.startsWith('image/')) return 'image';
  if (a.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (a.type.startsWith('video/')) return 'video';
  if (a.type.startsWith('audio/')) return 'audio';
  if (a.type.startsWith('text/') || ['txt', 'csv', 'json', 'md', 'log'].includes(ext)) return 'text';
  return 'other';
}
export const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

function FileViewer({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const kind = fileKind(file);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== 'text') return;
    fetch(file.url).then((r) => r.text()).then((t) => setText(t.slice(0, 200_000))).catch(() => setText('読み込みに失敗しました'));
  }, [file.url, kind]);
  return (
    <Modal size="xl" title={<><IconFile size={18} />{file.name}</>} onClose={onClose}
      footer={<>
        <span className="muted small grow">{fmtSize(file.size)}</span>
        <button className="btn btn-ghost" onClick={onClose}>閉じる</button>
        <a className="btn btn-primary" href={file.url} download={file.name}>ダウンロード</a>
      </>}>
      <div className={`viewer viewer-${kind}`}>
        {kind === 'image' && <img src={file.url} alt={file.name} />}
        {kind === 'pdf' && <iframe src={file.url} title={file.name} />}
        {kind === 'video' && <video src={file.url} controls />}
        {kind === 'audio' && <audio src={file.url} controls />}
        {kind === 'text' && <pre>{text ?? '読み込み中…'}</pre>}
        {kind === 'other' && (
          <div className="viewer-other">
            <IconFile size={56} />
            <b>{file.name}</b>
            <p className="muted">このファイル形式はブラウザ上でプレビューできません。ダウンロードして開いてください。</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

const ViewerCtx = createContext<(a: Attachment) => void>(() => {});
export const useFileViewer = () => useContext(ViewerCtx);
export function FileViewerProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<Attachment | null>(null);
  return (
    <ViewerCtx.Provider value={setFile}>
      {children}
      {file && <FileViewer file={file} onClose={() => setFile(null)} />}
    </ViewerCtx.Provider>
  );
}

export function Attachments({ items, large }: { items: Attachment[]; large?: boolean }) {
  const view = useFileViewer();
  if (!items?.length) return null;
  return (
    <div className={`attachments ${large ? 'large' : ''}`}>
      {items.map((a) =>
        fileKind(a) === 'image' ? (
          <button key={a.url} type="button" className="att-img" onClick={(e) => { e.stopPropagation(); view(a); }}><img src={a.url} alt={a.name} /></button>
        ) : (
          <button key={a.url} type="button" className="att-file" onClick={(e) => { e.stopPropagation(); view(a); }}><IconFile size={16} />{a.name}<small>{fmtSize(a.size)}</small></button>
        ),
      )}
    </div>
  );
}

// ---------- Sorting ----------
export function useSort<T>(rows: T[], getters: Record<string, (r: T) => string | number>, initial: string) {
  const [key, setKey] = useState(initial);
  const [dir, setDir] = useState<1 | -1>(1);
  const sorted = useMemo(() => {
    const g = getters[key];
    return [...rows].sort((a, b) => {
      const x = g(a);
      const y = g(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ja');
      return c * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, dir]);
  const th = (k: string, label: ReactNode) => (
    <th className="sortable" onClick={() => (k === key ? setDir((d) => (d === 1 ? -1 : 1)) : (setKey(k), setDir(1)))}>
      {label}
      <span className={`sort-ind ${k === key ? 'on' : ''}`}>{k === key ? (dir === 1 ? '▲' : '▼') : '⇅'}</span>
    </th>
  );
  return { sorted, th };
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (ymd: string) => {
  const d = new Date(ymd + 'T00:00:00');
  const year = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : '';
  return `${year}${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
};
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/**
 * Urgency order for a patient's visits: in progress, then upcoming (soonest first),
 * then unreported, then completed (most recent first), then cancelled.
 */
export const byUrgency = (today: string, now: string) =>
  (a: { status: VisitStatus; date: string; startTime: string; endTime: string }, b: { status: VisitStatus; date: string; startTime: string; endTime: string }) => {
    const rank = (v: typeof a) => ({ in_progress: 0, scheduled: 1, pending_report: 2, completed: 3, cancelled: 4 })[displayStatus(v, today, now)];
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ka = a.date + a.startTime;
    const kb = b.date + b.startTime;
    return ra <= 1 ? ka.localeCompare(kb) : kb.localeCompare(ka);
  };

/** Incomplete visits first, then by time. */
export const byPriority = (a: { status: string; date: string; startTime: string }, b: { status: string; date: string; startTime: string }) => {
  const rank = (s: string) => (s === 'in_progress' ? 0 : s === 'scheduled' ? 1 : 2);
  return rank(a.status) - rank(b.status) || (a.date + a.startTime).localeCompare(b.date + b.startTime);
};
