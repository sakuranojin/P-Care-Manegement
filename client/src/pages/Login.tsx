import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import Avatar from '../components/Avatar';
import { api } from '../api';
import { useAuth } from '../auth';
import type { PublicUser } from '@shared/types';

const DEMO = [
  { email: 'admin@demo.jp', label: '管理者（佐藤 美咲）', avatar: '/demo/admin.jpg', role: 'admin' as const },
  { email: 'doctor@demo.jp', label: '医師（田中 健一）', avatar: '/demo/doctor1.jpg', role: 'doctor' as const },
  { email: 'nurse@demo.jp', label: '看護師（伊藤 さくら）', avatar: '/demo/nurse1.jpg', role: 'nurse' as const },
  { email: 'newdoctor@demo.jp', label: '未所属の医師（招待テスト用）', avatar: '/demo/doctor4.jpg', role: 'doctor' as const },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const nav = useNavigate();

  const submit = async (e?: FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api<{ token: string; user: PublicUser }>('/auth/login', creds ?? { email, password });
      signIn(d.token, d.user);
      nav(d.user.profileCompleted ? '/app' : '/register/profile');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Logo />
        <h1>ログイン</h1>
        <form onSubmit={submit}>
          <div className="field">
            <label>メールアドレス</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div className="field">
            <label>パスワード</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'ログイン中…' : 'ログイン'}</button>
        </form>
        <p className="auth-switch">アカウントをお持ちでない方は <Link to="/register">新規登録</Link></p>
        <div className="demo-box">
          <p>デモアカウントでログイン（パスワード: demo1234）</p>
          {DEMO.map((d) => (
            <button key={d.email} className="demo-btn" onClick={() => submit(undefined, { email: d.email, password: 'demo1234' })} disabled={busy}>
              <Avatar user={d} size={30} />
              <span>{d.label}<small>{d.email}</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
