import { useRef, useState } from 'react';
import type { Gender, Role } from '@shared/types';
import { AREAS } from '@shared/areas';
import { roleLabel } from '@shared/labels';
import Avatar, { RoleMark } from './Avatar';
import { uploadFile } from '../api';
import { useToast } from './ui';

export interface ProfileValues {
  avatar: string;
  name: string;
  gender: Gender;
  birthDate: string;
  role: Role;
  jobTitle: string;
  phone: string;
  area: string;
}

const ROLE_TEXT: Record<Role, string> = {
  admin: '所属ユニットを作成し、チーム・患者・権限を管理します',
  doctor: '自分の訪問予定を確認し、訪問後にレポートを登録します',
  nurse: '担当患者のスケジュールを管理し、状態を記録・共有します',
};

export default function ProfileForm({ value, onChange, roleLocked }: { value: ProfileValues; onChange: (v: ProfileValues) => void; roleLocked?: boolean }) {
  const set = <K extends keyof ProfileValues>(k: K, v: ProfileValues[K]) => onChange({ ...value, [k]: v });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const hasPhoto = !!value.avatar && !value.avatar.startsWith('default:') && !value.avatar.startsWith('preset:');

  const onFile = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('画像ファイルを選択してください', 'err');
    setUploading(true);
    try {
      set('avatar', (await uploadFile(f)).url);
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="profile-form">
      <div className="field">
        <label>アバター</label>
        <div className="avatar-picker">
          <div className="avatar-preview">
            <Avatar user={{ avatar: hasPhoto ? value.avatar : `default:${value.gender}`, role: value.role }} size={96} />
            <small>職種マーク付きで表示されます</small>
          </div>
          <div className="avatar-upload">
            <p className="hint">パソコンから写真を選択してください。選択しない場合は性別に応じたアイコン（男性：青／女性：ピンク）が使われます。</p>
            <div className="row-start">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'アップロード中…' : hasPhoto ? '別の写真を選択' : 'PCから写真を選択'}
              </button>
              {hasPhoto && <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('avatar', '')}>写真を外す</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>氏名 <em>必須</em></label>
          <input value={value.name} onChange={(e) => set('name', e.target.value)} placeholder="例）山田 花子" />
        </div>
        <div className="field">
          <label>生年月日 <em>必須</em></label>
          <input type="date" value={value.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('birthDate', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>性別 <em>必須</em></label>
        <div className="seg">
          {(['male', 'female'] as Gender[]).map((g) => (
            <button type="button" key={g} className={value.gender === g ? `active g-${g}` : ''} onClick={() => set('gender', g)}>
              {{ male: '男性', female: '女性', other: '' }[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>職種 <em>必須</em></label>
        <div className="role-choices">
          {(['admin', 'nurse', 'doctor'] as Role[]).map((r) => (
            <button type="button" key={r} disabled={roleLocked && value.role !== r} className={`role-choice ${value.role === r ? 'active' : ''}`} onClick={() => set('role', r)}>
              <RoleMark role={r} size={30} />
              <b>{roleLabel[r]}</b>
              <small>{ROLE_TEXT[r]}</small>
            </button>
          ))}
        </div>
        {roleLocked && <small className="hint">職種は登録後に変更できません</small>}
      </div>

      <div className="grid-2">
        <div className="field">
          <label>電話番号 {value.role !== 'admin' && <em>必須</em>}</label>
          <input type="tel" value={value.phone} onChange={(e) => set('phone', e.target.value)} placeholder="例）090-1234-5678" autoComplete="tel" />
          <small className="hint">スタッフ詳細に表示されます</small>
        </div>
        <div className="field">
          <label>役職</label>
          <input value={value.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder="例）訪問看護師・院長・事務長" />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>拠点エリア</label>
          <select value={value.area} onChange={(e) => set('area', e.target.value)}>
            <option value="">選択してください</option>
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <small className="hint">患者宅に近い医師の検索に使用します</small>
        </div>
      </div>
    </div>
  );
}
