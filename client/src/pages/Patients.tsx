import { useState } from 'react';
import type { Gender, Patient, Visit } from '@shared/types';
import { AREAS, areaName, distanceKm } from '@shared/areas';
import { ageOf, genderLabel } from '@shared/labels';
import { api } from '../api';
import { canManagePatients, canSchedule, seesAll, useAuth } from '../auth';
import { useUnitData } from '../data';
import Avatar from '../components/Avatar';
import VisitForm from '../components/VisitForm';
import { useDetails } from '../components/DetailHost';
import { IconCalendar, IconEdit, IconPlus, IconSearch } from '../components/Icons';
import { Empty, Modal, byPriority, fmtDate, nowHM, useSort, useToast, ymd } from '../components/ui';

type Data = ReturnType<typeof useUnitData>;

function PatientForm({ data, editing, onClose }: { data: Data; editing?: Patient; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({
    name: editing?.name ?? '', kana: editing?.kana ?? '', gender: editing?.gender ?? ('female' as Gender),
    birthDate: editing?.birthDate ?? '', area: editing?.area ?? '', address: editing?.address ?? '', phone: editing?.phone ?? '',
    diagnosis: editing?.diagnosis ?? '', careLevel: editing?.careLevel ?? '', notes: editing?.notes ?? '',
    email: editing?.email ?? '',
    doctorId: editing?.doctorIds[0] ?? '', nurseId: editing?.nurseIds[0] ?? (user?.role === 'nurse' ? user.id : ''),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  // Doctors nearest to the patient's area first.
  // Staff closest to the patient's home come first.
  const nearest = (role: 'doctor' | 'nurse') => data.team
    .filter((u) => u.role === role)
    .map((d) => ({ d, km: f.area ? distanceKm(f.area, d.area) : null }))
    .sort((a, b) => (a.km ?? 999) - (b.km ?? 999));
  const doctors = nearest('doctor');
  const nurses = nearest('nurse');
  const submit = async () => {
    setBusy(true);
    try {
      if (editing) {
        const r = await api<{ moved: number; cancelled: number }>(`/patients/${editing.id}`, f, 'PUT');
        const handover = r.moved || r.cancelled ? `（今後の訪問 ${r.moved}件を新担当へ引継ぎ${r.cancelled ? `・${r.cancelled}件は予定重複のためキャンセル` : ''}）` : '';
        toast(`患者情報を更新しました${handover}`);
      } else {
        await api('/patients', f);
        toast('患者を登録し、担当スタッフに通知しました');
      }
      onClose();
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  const changed = !!editing && (f.doctorId !== editing.doctorIds[0] || f.nurseId !== editing.nurseIds[0]);

  return (
    <Modal title={editing ? '患者情報を編集' : '新規患者を追加'} onClose={onClose} wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>キャンセル</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{editing ? '更新する' : '登録する'}</button></>}>
      <div className="grid-3">
        <div className="field"><label>氏名 <em>必須</em></label><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="山田 太郎" /></div>
        <div className="field"><label>フリガナ</label><input value={f.kana} onChange={(e) => set('kana', e.target.value)} placeholder="ヤマダ タロウ" /></div>
        <div className="field"><label>生年月日 <em>必須</em></label><input type="date" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></div>
      </div>
      <div className="grid-3">
        <div className="field"><label>性別 <em>必須</em></label>
          <select value={f.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="male">男性</option><option value="female">女性</option>
          </select>
        </div>
        <div className="field"><label>電話番号</label><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="03-1234-5678" /></div>
        <div className="field"><label>メールアドレス <em>必須</em></label><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="訪問予定の通知先" /></div>
      </div>
      <div className="grid-3">
        <div className="field"><label>介護度</label>
          <select value={f.careLevel} onChange={(e) => set('careLevel', e.target.value)}>
            <option value="">未設定</option>
            {['要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label>エリア</label>
          <select value={f.area} onChange={(e) => set('area', e.target.value)}>
            <option value="">選択してください</option>
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field"><label>住所 <em>必須</em></label><input value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="東京都世田谷区…" /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label>病状・診断名</label><input value={f.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} placeholder="慢性心不全" /></div>
        <div className="field"><label>備考</label><input value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="訪問時の注意点など" /></div>
      </div>

      <>
          <div className="field">
            <label>担当医師 <em>必須</em> <small className="muted">エリアを選ぶと患者宅から近い順に並びます</small></label>
            <div className="chip-select">
              {doctors.map(({ d, km }, i) => (
                <button type="button" key={d.id} className={f.doctorId === d.id ? 'on' : ''} onClick={() => set('doctorId', d.id)}>
                  <Avatar user={d} size={24} showMark={false} />{d.name}{km != null && <small>{km}km</small>}{i === 0 && km != null && <span className="tag tag-accent tag-sm">最寄り</span>}
                </button>
              ))}
            </div>
          </div>
          {!editing && user?.role === 'nurse' ? (
            <p className="hint">担当看護師: あなた（{user.name}）</p>
          ) : (
            <div className="field">
              <label>担当看護師 <em>必須</em> <small className="muted">患者宅から近い順</small></label>
              <div className="chip-select">
                {nurses.map(({ d: u, km }, i) => (
                  <button type="button" key={u.id} className={f.nurseId === u.id ? 'on' : ''} onClick={() => set('nurseId', u.id)}>
                    <Avatar user={u} size={24} showMark={false} />{u.name}{km != null && <small>{km}km</small>}{i === 0 && km != null && <span className="tag tag-accent tag-sm">最寄り</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          {changed && (
            <p className="notice-box small">担当を変更すると、以前の担当医師・看護師はこの患者の情報を閲覧できなくなります。今後の訪問予定は新しい担当者に引き継がれます。</p>
          )}
      </>
    </Modal>
  );
}

export default function Patients() {
  const { user } = useAuth();
  const data = useUnitData();
  const { openPatient } = useDetails();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ editing?: Patient } | null>(null);
  const [visitFor, setVisitFor] = useState<Partial<Visit> | null>(null);
  const today = ymd(new Date());

  const rows = data.patients
    .filter((p) => !q || [p.name, p.kana, p.address, p.diagnosis, p.phone].some((s) => s.includes(q)))
    .map((p) => {
      const vs = data.visits.filter((v) => v.patientId === p.id && v.status !== 'cancelled');
      const done = vs.filter((v) => v.status === 'completed').sort((a, b) => b.date.localeCompare(a.date));
      // The most immediate upcoming visit (in progress, or not yet ended).
      const t = nowHM();
      const next = vs
        .filter((v) => v.status === 'in_progress' || (v.status === 'scheduled' && (v.date > today || (v.date === today && v.endTime > t))))
        .sort(byPriority)[0];
      return { p, done, next };
    });
  const { sorted, th } = useSort(rows, {
    name: (r) => r.p.kana || r.p.name,
    age: (r) => ageOf(r.p.birthDate) ?? 0,
    address: (r) => r.p.address,
    diagnosis: (r) => r.p.diagnosis,
    history: (r) => r.done.length,
    next: (r) => (r.next ? r.next.date + r.next.startTime : '9999'),
  }, 'next');

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>患者</h1>
          <p className="muted">{seesAll(user) ? 'ユニットの全患者' : 'あなたが担当する患者'}を表示しています。行をクリックすると詳細を表示します。</p>
        </div>
        {canManagePatients(user) && <button className="btn btn-primary" onClick={() => setForm({})}><IconPlus size={18} />新規患者を追加</button>}
      </div>
      <section className="card">
        <div className="section-head">
          <div className="input-icon search"><IconSearch size={18} /><input placeholder="氏名・住所・病名で検索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="muted small">{sorted.length}名</span>
        </div>
        <div className="table-wrap">
          <table className="table clickable">
            <thead>
              <tr>{th('name', '氏名')}{th('age', '年齢')}{th('address', '住所')}<th>電話番号</th>{th('diagnosis', '病状')}{th('history', '訪問履歴')}<th>担当スタッフ</th>{th('next', '次回訪問')}<th></th></tr>
            </thead>
            <tbody>
              {sorted.map(({ p, done, next }) => (
                <tr key={p.id} onClick={() => openPatient(p.id)}>
                  <td><b>{p.name}</b><small className="block muted">{p.kana}・{genderLabel[p.gender]}</small></td>
                  <td className="nowrap">{ageOf(p.birthDate)}歳</td>
                  <td className="small">{p.address}<small className="block muted">{areaName(p.area)}</small></td>
                  <td className="nowrap small">{p.phone}</td>
                  <td>{p.diagnosis}{p.careLevel && <small className="block muted">{p.careLevel}</small>}</td>
                  <td className="small nowrap">{done.length}回{done[0] && <small className="block muted">最終 {done[0].date.slice(5).replace('-', '/')}</small>}</td>
                  <td>
                    <div className="avatar-stack">
                      {[...p.doctorIds, ...p.nurseIds].map((id) => data.userMap.get(id)).filter(Boolean).map((u) => <Avatar key={u!.id} user={u!} size={30} />)}
                    </div>
                  </td>
                  <td className="small">
                    {next ? <>{fmtDate(next.date)}<small className="block muted">{next.startTime}〜 {data.userMap.get(next.doctorId)?.name}</small></> : <span className="muted">予定なし</span>}
                    {canSchedule(user) && (
                      <button className="link-btn" onClick={(e) => { e.stopPropagation(); setVisitFor({ patientId: p.id, date: today }); }}><IconCalendar size={14} />予定を追加</button>
                    )}
                  </td>
                  <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                    {canManagePatients(user) && <button className="icon-btn" title="編集" onClick={() => setForm({ editing: p })}><IconEdit size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.loaded && !sorted.length && <Empty>患者が登録されていません</Empty>}
        </div>
      </section>
      {form && <PatientForm data={data} editing={form.editing} onClose={() => setForm(null)} />}
      {visitFor && <VisitForm data={data} initial={visitFor} onClose={() => setVisitFor(null)} />}
    </div>
  );
}
