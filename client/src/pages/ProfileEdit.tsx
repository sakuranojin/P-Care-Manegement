import { useState } from 'react';
import ProfileForm, { type ProfileValues } from '../components/ProfileForm';
import { api } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/ui';
import { IconKey } from '../components/Icons';

/** Profile details can be edited; the job role (職種) chosen at registration is fixed. */
export default function ProfileEdit() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [v, setV] = useState<ProfileValues>({
    avatar: user!.avatar, name: user!.name, gender: user!.gender, birthDate: user!.birthDate, role: user!.role,
    jobTitle: user!.jobTitle, phone: user!.phone ?? '', area: user!.area,
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const save = async () => {
    setBusy(true);
    try {
      setUser((await api('/auth/profile', { ...v, role: user.role }, 'PUT')).user);
      toast('プロフィールを更新しました');
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  const changePw = async () => {
    try {
      await api('/auth/password', pw, 'PUT');
      setPw({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
      toast('パスワードを変更しました');
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };

  return (
    <div className="container narrow">
      <div className="page-head"><div><h1>プロフィール編集</h1><p className="muted">{user.email}</p></div></div>
      <section className="card">
        <ProfileForm value={v} onChange={(x) => setV({ ...x, role: user.role })} roleLocked />
        <div className="row-end"><button className="btn btn-primary" onClick={save} disabled={busy}>保存する</button></div>
      </section>
      <section className="card">
        <h2 className="card-title"><IconKey />パスワード変更</h2>
        <div className="grid-3">
          <div className="field"><label>現在のパスワード</label><input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></div>
          <div className="field"><label>新しいパスワード</label><input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></div>
          <div className="field"><label>新しいパスワード（確認）</label><input type="password" value={pw.newPasswordConfirm} onChange={(e) => setPw({ ...pw, newPasswordConfirm: e.target.value })} autoComplete="new-password" /></div>
        </div>
        <div className="row-end"><button className="btn btn-outline" onClick={changePw} disabled={!pw.currentPassword || !pw.newPassword}>パスワードを変更</button></div>
      </section>
    </div>
  );
}
