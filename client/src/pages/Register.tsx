import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { api } from '../api';
import { useAuth } from '../auth';
import type { PublicUser } from '@shared/types';

export function Steps({ step }: { step: 1 | 2 }) {
  return (
    <ol className="steps">
      <li className={step >= 1 ? 'on' : ''}><span>1</span>アカウント情報</li>
      <li className={step >= 2 ? 'on' : ''}><span>2</span>プロフィール設定</li>
    </ol>
  );
}

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const nav = useNavigate();
  const mismatch = passwordConfirm.length > 0 && password !== passwordConfirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError('');
    try {
      const d = await api<{ token: string; user: PublicUser }>('/auth/register', { email, password, passwordConfirm });
      signIn(d.token, d.user);
      nav('/register/profile');
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
        <h1>新規登録</h1>
        <Steps step={1} />
        <form onSubmit={submit}>
          <div className="field">
            <label>メールアドレス <em>必須</em></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div className="field">
            <label>パスワード <em>必須</em></label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
            <small className="hint">8文字以上で入力してください</small>
          </div>
          <div className="field">
            <label>パスワード（確認） <em>必須</em></label>
            <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" required />
            {mismatch && <small className="field-error">パスワードが一致しません</small>}
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || mismatch}>{busy ? '登録中…' : '次へ進む'}</button>
        </form>
        <p className="auth-switch">既にアカウントをお持ちの方は <Link to="/login">ログイン</Link></p>
      </div>
    </div>
  );
}
