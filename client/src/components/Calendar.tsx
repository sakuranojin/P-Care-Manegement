import type { ReactNode } from 'react';
import type { Patient, PublicUser, Visit } from '@shared/types';
import { IconChevronLeft, IconChevronRight } from './Icons';
import { byPriority, nowHM, ymd } from './ui';
import { AvatarImage } from './Avatar';
import { displayStatus } from '@shared/labels';

const surname = (n?: string) => (n ?? '').split(/[\s　]/)[0];

export default function Calendar({ month, onMonth, visits, userMap, patientMap, selected, onSelect, show = 'doctor', toolbar }: {
  month: Date;
  onMonth: (d: Date) => void;
  visits: Visit[];
  userMap: Map<string, PublicUser>;
  patientMap: Map<string, Patient>;
  selected: string;
  onSelect: (d: string) => void;
  /** whose name to show on each visit chip ("patient" = own calendar, patient name only) */
  show?: 'doctor' | 'nurse' | 'patient';
  toolbar?: ReactNode;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const byDate = new Map<string, Visit[]>();
  for (const v of visits) {
    if (v.status === 'cancelled') continue;
    byDate.set(v.date, [...(byDate.get(v.date) ?? []), v]);
  }
  byDate.forEach((list) => list.sort(byPriority)); // incomplete visits first
  const today = ymd(new Date());
  const now = nowHM();
  const shift = (n: number) => onMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const label = (v: Visit) => {
    const patient = `${patientMap.get(v.patientId)?.name ?? ''}様`;
    if (show === 'patient') return patient;
    return `${surname(userMap.get(show === 'nurse' ? v.nurseId : v.doctorId)?.name)}→${patient}`;
  };

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="前の月"><IconChevronLeft /></button>
        <h3>{month.getFullYear()}年 {month.getMonth() + 1}月</h3>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="次の月"><IconChevronRight /></button>
        <button className="btn btn-sm btn-ghost" onClick={() => { onMonth(new Date()); onSelect(today); }}>今日</button>
        <div className="cal-legend">
          <span><i className="lg-in_progress" />訪問中</span>
          <span><i className="lg-scheduled" />予定</span>
          <span><i className="lg-pending_report" />未報告</span>
          <span><i className="lg-completed" />完了</span>
          <span><i className="lg-awaiting" />承認待ち</span>
        </div>
        <div className="cal-tools">{toolbar}</div>
      </div>
      <div className="cal-grid">
        {['日', '月', '火', '水', '木', '金', '土'].map((w, i) => (
          <div key={w} className={`cal-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</div>
        ))}
        {cells.map((d) => {
          const key = ymd(d);
          const list = byDate.get(key) ?? [];
          const open = list.filter((v) => v.status !== 'completed').length;
          const other = d.getMonth() !== month.getMonth();
          return (
            <button key={key}
              className={`cal-cell ${other ? 'other' : ''} ${key === today ? 'today' : ''} ${key === selected ? 'selected' : ''} ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}`}
              onClick={() => onSelect(key)}>
              <span className="cal-day">{d.getDate()}{list.length > 0 && <span className="cal-count">{open > 0 ? `未完了${open}` : '完了'}</span>}</span>
              {list.slice(0, 3).map((v) => {
                const doc = userMap.get(v.doctorId);
                const approved = v.approval === 'approved' && doc;
                return (
                  <span key={v.id} className={`cal-chip st-${displayStatus(v, today, now)} ${v.urgent ? 'urgent' : ''} ${v.approval === 'pending' ? 'awaiting' : ''}`}
                    title={approved ? `${doc!.name}医師 承認済み${v.urgent ? '（応援医師）' : ''}` : v.approval === 'pending' ? '医師の承認待ち' : ''}>
                    {approved && <AvatarImage avatar={doc!.avatar} size={13} />}
                    <b>{v.startTime}</b> {label(v)}
                  </span>
                );
              })}
              {list.length > 3 && <span className="cal-more">他 {list.length - 3}件</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
