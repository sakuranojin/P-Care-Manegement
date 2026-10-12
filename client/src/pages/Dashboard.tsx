import { useEffect, useState } from 'react';
import type { Activity, Visit } from '@shared/types';
import { useApi } from '../api';
import { canSchedule, seesAll, useAuth } from '../auth';
import { useUnitData } from '../data';
import Calendar from '../components/Calendar';
import VisitForm from '../components/VisitForm';
import VisitDetail, { ApprovalMark } from '../components/VisitDetail';
import { displayStatus } from '@shared/labels';
import Avatar from '../components/Avatar';
import { IconCalendar, IconCheck, IconClock, IconPatient, IconPlus, IconUsers } from '../components/Icons';
import { Empty, Modal, VisitPill, byPriority, fmtDate, nowHM, ymd } from '../components/ui';

interface Stats {
  teamCount: number;
  onlineCount: number;
  patientCount: number;
}

function relTime(v: Visit, today: string) {
  if (v.status === 'in_progress') return '訪問中';
  if (v.date !== today) return fmtDate(v.date);
  const d = new Date();
  const mins = Number(v.startTime.slice(0, 2)) * 60 + Number(v.startTime.slice(3)) - (d.getHours() * 60 + d.getMinutes());
  return mins <= 0 ? 'まもなく' : mins < 60 ? `あと${mins}分` : `あと${Math.floor(mins / 60)}時間${mins % 60 ? `${mins % 60}分` : ''}`;
}

const activityIcon: Record<Activity['kind'], string> = {
  visit_created: '📅', visit_started: '🚗', visit_completed: '✅', visit_cancelled: '✖️', visit_approved: '👍', visit_declined: '🙅', patient_added: '🧑‍🦳', patient_update: '📝', urgent: '🚨', member_joined: '👋',
};

export default function Dashboard() {
  const { user } = useAuth();
  const data = useUnitData();
  const all = seesAll(user);
  const { data: stats } = useApi<Stats>('/stats', ['team', 'patients']);
  const { data: activities } = useApi<Activity[]>('/activities', ['activities']);
  const today = ymd(new Date());
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [form, setForm] = useState<{ editing?: Visit; initial?: Partial<Visit> } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000); // keep "upcoming" relative to now
    return () => clearInterval(t);
  }, []);
  if (!user) return null;

  const active = data.visits.filter((v) => v.status !== 'cancelled');
  const todays = active.filter((v) => v.date === today);
  const done = todays.filter((v) => v.status === 'completed').length;
  const calVisits = active;
  const show: 'doctor' | 'nurse' = 'doctor';
  // Doctors and nurses only see their own visits, so their calendar shows patient names.
  const calShow = all ? show : 'patient';
  // In the side lists, show the other person on the visit (the doctor for nurses, the nurse for doctors).
  const sideShow: 'doctor' | 'nurse' = all ? show : user.role === 'doctor' ? 'nurse' : 'doctor';
  const t = nowHM();
  const upcoming = calVisits
    .filter((v) => v.status === 'in_progress' || (v.status === 'scheduled' && (v.date > today || (v.date === today && v.endTime > t))))
    .sort(byPriority)
    .slice(0, 5);
  const next = upcoming[0];
  const weekEnd = ymd(new Date(Date.now() + 7 * 86400_000));
  const weekCount = active.filter((v) => v.status !== 'completed' && v.date >= today && v.date <= weekEnd).length;
  const dayList = day ? calVisits.filter((v) => v.date === day).sort(byPriority) : [];

  return (
    <div className="container dash">
      <div className="stats">
        {all ? (
          <div className="stat-group">
            <div className="stat"><span className="stat-icon c-teal"><IconUsers /></span><div><small>チームメンバー</small><b>{stats?.teamCount ?? '–'}<em>名</em></b></div></div>
            <div className="stat"><span className="stat-icon c-green"><span className="live-dot" /></span><div><small>ログイン中</small><b>{stats?.onlineCount ?? '–'}<em>名</em></b></div></div>
            <div className="stat"><span className="stat-icon c-pink"><IconPatient /></span><div><small>患者数</small><b>{stats?.patientCount ?? '–'}<em>名</em></b></div></div>
          </div>
        ) : (
          <div className="stat-group">
            <div className="stat"><span className="stat-icon c-pink"><IconPatient /></span><div><small>担当患者</small><b>{data.patients.length}<em>名</em></b></div></div>
            <div className="stat"><span className="stat-icon c-teal"><IconCalendar /></span><div><small>今後7日間の予定</small><b>{weekCount}<em>件</em></b></div></div>
            <div className="stat"><span className="stat-icon c-blue"><IconClock /></span><div><small>次の訪問</small><b className="stat-next">{next ? (next.status === 'in_progress' ? '訪問中' : next.date === today ? next.startTime : fmtDate(next.date).replace(/（.）/, '')) : '—'}</b></div></div>
          </div>
        )}
        <div className="stat-group today">
          <div className="stat"><span className="stat-icon c-orange"><IconCalendar /></span><div><small>{all ? '本日の予定' : 'あなたの本日の予定'}</small><b>{todays.length}<em>件</em></b></div></div>
          <div className="stat"><span className="stat-icon c-green"><IconCheck /></span><div><small>完了</small><b>{done}<em>件</em></b></div></div>
          <div className="stat"><span className="stat-icon c-blue"><IconClock /></span><div><small>未完了</small><b>{todays.length - done}<em>件</em></b></div></div>
          <div className="progress" title={`完了率 ${todays.length ? Math.round((done / todays.length) * 100) : 0}%`}>
            <span style={{ width: `${todays.length ? (done / todays.length) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <section className="card cal-card">
          <Calendar month={month} onMonth={setMonth} visits={calVisits} userMap={data.userMap} patientMap={data.patientMap} selected={day ?? ''} show={calShow}
            onSelect={(d) => { setDay(d); const dt = new Date(d + 'T00:00:00'); if (dt.getMonth() !== month.getMonth()) setMonth(dt); }}
            toolbar={<>
              {canSchedule(user) && (
                <button className="btn btn-sm btn-primary" onClick={() => setForm({ initial: { date: today } })}><IconPlus size={15} />訪問予定を追加</button>
              )}
            </>} />
        </section>

        <aside className="dash-side">
          <section className="card side-card">
            <h2 className="card-title"><IconClock />今後の予定</h2>
            <ul className="upcoming">
              {upcoming.map((v) => {
                const p = data.patientMap.get(v.patientId);
                const s = data.userMap.get(sideShow === 'nurse' ? v.nurseId : v.doctorId);
                return (
                  <li key={v.id} onClick={() => setDetail(v.id)} className={`st-${v.status}`}>
                    <span className="up-when">{relTime(v, today)}<small>{v.startTime}〜{v.endTime}</small></span>
                    <div className="grow">
                      <b>{v.urgent && <span className="urgent-tag">緊急</span>}{p?.name ?? '—'} 様</b>
                      <small>{s?.name}・{v.purpose}</small>
                      <ApprovalMark v={v} doctor={data.userMap.get(v.doctorId)} compact />
                    </div>
                    {s && <Avatar user={s} size={30} />}
                  </li>
                );
              })}
              {!upcoming.length && <Empty>今後の予定はありません</Empty>}
            </ul>
          </section>
          <section className="card side-card">
            <h2 className="card-title">🔔 通知</h2>
            <ul className="activity">
              {activities?.slice(0, 12).map((a) => (
                <li key={a.id}>
                  <span className="act-icon">{activityIcon[a.kind]}</span>
                  <div className="grow"><p>{a.text}</p><small>{new Date(a.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div>
                </li>
              ))}
              {activities && !activities.length && <Empty>通知はありません</Empty>}
            </ul>
          </section>
        </aside>
      </div>


      {day && (
        <Modal size="sm" title={`${fmtDate(day)}の予定`} onClose={() => setDay(null)}>
          {!dayList.length ? <Empty>この日の訪問予定はありません</Empty> : (
            <ul className="day-list">
              {dayList.map((v) => {
                const d = data.userMap.get(v.doctorId);
                const n = data.userMap.get(v.nurseId);
                return (
                  <li key={v.id} className={`st-${displayStatus(v, today, t)}`} onClick={() => setDetail(v.id)}>
                    <span className="dl-time">{v.startTime}<small>〜{v.endTime}</small></span>
                    <div className="grow">
                      <b>{v.urgent && <span className="urgent-tag">緊急</span>}{data.patientMap.get(v.patientId)?.name ?? '—'} 様</b>
                      <small>{d?.name}{n ? `・${n.name}` : ''}・{v.purpose}</small>
                      <ApprovalMark v={v} doctor={d} compact />
                    </div>
                    <VisitPill status={displayStatus(v, today, t)} />
                  </li>
                );
              })}
            </ul>
          )}
          {canSchedule(user) && day >= today && (
            <button className="btn btn-sm btn-outline btn-block-sm" onClick={() => { setForm({ initial: { date: day } }); setDay(null); }}><IconPlus size={15} />この日に予定を追加</button>
          )}
        </Modal>
      )}
      {detail && <VisitDetail visitId={detail} data={data} onClose={() => setDetail(null)}
        onEdit={() => { const v = data.visits.find((x) => x.id === detail); setDetail(null); setDay(null); setForm({ editing: v }); }} />}
      {form && <VisitForm data={data} editing={form.editing} initial={form.initial} onClose={() => setForm(null)} />}
    </div>
  );
}
