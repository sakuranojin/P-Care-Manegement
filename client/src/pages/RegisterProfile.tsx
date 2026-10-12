import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import ProfileForm, { type ProfileValues } from '../components/ProfileForm';
import { api } from '../api';
import { useAuth } from '../auth';
import { Steps } from './Register';
import type { PublicUser } from '@shared/types';

export default function RegisterProfile() {
  const { user, loading, setUser } = useAuth();
  const nav = useNavigate();
  const [v, setV] = useState<ProfileValues>({ avatar: '', name: '', gender: 'female', birthDate: '', role: 'nurse', jobTitle: '', phone: '', area: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="page-loading">読み込み中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.profileCompleted) return <Navigate to="/app" replace />;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await api<{ user: PublicUser }>('/auth/profile', v, 'PUT');
      setUser(d.user);
      nav('/app');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-wide">
        <Logo />
        <h1>プロフィール設定</h1>
        <Steps step={2} />
        <ProfileForm value={v} onChange={setV} />
        <p className="notice-box small">職種は登録後に変更できません（その他のプロフィールは後から編集できます）。</p>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-block" onClick={() => confirm('この内容で登録します。職種は登録後に変更できません。よろしいですか？') && submit()} disabled={busy}>{busy ? '保存中…' : '登録を完了する'}</button>
      </div>
    </div>
  );
}
