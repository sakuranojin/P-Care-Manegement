import { Link } from 'react-router-dom';
import { useState } from 'react';
import Logo, { LogoMark } from '../components/Logo';
import Avatar from '../components/Avatar';
import {
  IconCalendar, IconChat, IconChevronDown, IconMegaphone, IconPatient, IconRoute, IconShield, IconSparkle, IconUsers,
} from '../components/Icons';
import { useAuth } from '../auth';

const FEATURES = [
  { icon: <IconCalendar />, title: '訪問スケジュール管理', text: '月間カレンダーで医師・看護師の訪問予定をひと目で把握。日付をクリックすると時間順の訪問一覧と完了状況を確認できます。' },
  { icon: <IconSparkle />, title: 'AIスケジュールチェック', text: '医師の予定が重なると自動で警告し、空き時間を提案。患者宅から近い医師を優先して検索できます。' },
  { icon: <IconPatient />, title: '在宅患者情報の一元管理', text: '住所・連絡先・診断名・訪問履歴・担当スタッフを集約。看護師は画像やファイル付きで状態を記録できます。' },
  { icon: <IconUsers />, title: 'チーム・権限管理', text: 'メール招待でスタッフを追加し、スケジュール編集・閲覧のみ・マネージャーの3段階で権限を付与できます。' },
  { icon: <IconChat />, title: '多職種チャット', text: '必要なメンバーだけでグループを作成。既読表示で、伝わったかどうかがすぐにわかります。' },
  { icon: <IconMegaphone />, title: '全体お知らせ', text: '管理者からチーム全員へ一斉連絡。受け取ったお知らせはナビゲーションの通知アイコンに表示されます。' },
];

const REASONS = [
  { no: '01', title: '現場の声から生まれた設計', text: '訪問診療・訪問看護の現場で「本当に必要な情報」だけを、必要な人に届けます。' },
  { no: '02', title: 'はじめてでも迷わない画面', text: 'ITが得意でない方でも直感的に使えるよう、シンプルな画面構成にしています。' },
  { no: '03', title: '職種ごとに最適な表示', text: '管理者・医師・看護師それぞれに合わせたダッシュボードで、自分に関係する情報だけを表示します。' },
];

const STEPS = [
  { title: 'アカウント登録', text: 'メールアドレスとパスワードで登録し、プロフィールと職種を設定します。' },
  { title: '所属ユニット作成', text: '管理者がクリニック・事業所などの所属ユニットを作成します。' },
  { title: 'スタッフを招待', text: '登録済みの医師・看護師をメールで招待。承認するとチームに参加します。' },
  { title: '運用スタート', text: '患者情報と訪問予定を登録すれば、すぐにチームで共有できます。' },
];

const FAQ = [
  { q: '利用に専用の端末やソフトは必要ですか？', a: 'いいえ。パソコン・タブレット・スマートフォンのブラウザからご利用いただけます。最新版の Google Chrome / Microsoft Edge / Safari を推奨しています。' },
  { q: '医師・看護師が登録後すぐに患者情報を見られますか？', a: '個人情報保護のため、登録直後は情報にアクセスできません。管理者からの招待を承認し、所属ユニットに参加した時点で閲覧できるようになります。' },
  { q: '同じ時間に医師の予約が重なった場合はどうなりますか？', a: '後から登録しようとした方に「既に予約が入っています」と表示され、医師の空き時間の候補を提案します。' },
  { q: 'デモ版を試すことはできますか？', a: 'はい。ログイン画面のデモアカウント（管理者・医師・看護師）で、すぐに全機能をお試しいただけます。' },
];

function HeroMock() {
  const days = Array.from({ length: 35 }, (_, i) => i - 2);
  return (
    <div className="hero-mock" aria-hidden="true">
      <div className="hm-bar">
        <LogoMark size={22} />
        <b>P-CARE-MANAGEMENT</b>
        <span className="hm-icons"><i /><i /><Avatar user={{ avatar: 'preset:3', role: 'admin' }} size={24} /></span>
      </div>
      <div className="hm-stats">
        {[['チーム', '8'], ['患者', '24'], ['本日', '12'], ['完了', '7']].map(([l, n]) => (
          <div key={l}><small>{l}</small><b>{n}</b></div>
        ))}
      </div>
      <div className="hm-cal">
        {days.map((d) => (
          <div key={d} className={d === 12 ? 'today' : ''}>
            {d > 0 && d <= 31 && <small>{d}</small>}
            {d > 0 && d <= 31 && d % 3 !== 0 && <span className={`c${d % 4}`} />}
            {d > 0 && d <= 31 && d % 2 === 0 && <span className={`c${(d + 1) % 4}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-inner">
          <Logo />
          <nav className="lp-nav">
            <a href="#features">機能</a>
            <a href="#reasons">選ばれる理由</a>
            <a href="#flow">導入の流れ</a>
            <a href="#faq">よくある質問</a>
          </nav>
          <div className="lp-actions">
            {user ? (
              <Link className="btn btn-primary" to="/app">ダッシュボードへ</Link>
            ) : (
              <>
                <Link className="btn btn-ghost" to="/login">ログイン</Link>
                <Link className="btn btn-primary" to="/register">新規登録</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="lp-inner hero-grid">
          <div>
            <p className="eyebrow">在宅医療チームのためのDX支援サービス</p>
            <h1>
              訪問診療・訪問看護を、<br />
              <span className="hl">ひとつのチーム</span>に。
            </h1>
            <p className="lead">
              P-CARE-MANAGEMENT は、訪問スケジュール・在宅患者情報・チーム内の連絡をまとめて管理できるオールインワンサービスです。
              ダブルブッキングの自動チェックや近くの医師の検索で、現場の調整業務を減らします。
            </p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" to="/register">無料で新規登録</Link>
              <Link className="btn btn-outline btn-lg" to="/login">デモを体験する</Link>
            </div>
            <ul className="hero-points">
              <li><IconShield size={16} /> 所属ユニット単位の情報管理</li>
              <li><IconRoute size={16} /> 患者宅に近い医師を優先検索</li>
            </ul>
          </div>
          <HeroMock />
        </div>
      </section>

      <section id="features" className="lp-section">
        <div className="lp-inner">
          <p className="sec-en">FEATURES</p>
          <h2 className="sec-title">在宅医療に必要な業務を、<br className="sp" />まるごとデジタルに。</h2>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <article className="feature" key={f.title}>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-roles">
        <div className="lp-inner">
          <p className="sec-en">FOR EVERY ROLE</p>
          <h2 className="sec-title">職種ごとに、見るべき情報だけを。</h2>
          <div className="role-grid">
            <div className="role-card"><Avatar user={{ avatar: '/demo/admin.jpg', role: 'admin' }} size={64} /><h3>管理者</h3><p>チーム全体の訪問状況・患者数・スタッフの稼働をダッシュボードで把握。権限付与やお知らせ配信も。</p></div>
            <div className="role-card"><Avatar user={{ avatar: '/demo/doctor1.jpg', role: 'doctor' }} size={64} /><h3>医師</h3><p>自分の訪問予定だけをカレンダーに表示。訪問後はレポートや画像をアップロードして完了報告。</p></div>
            <div className="role-card"><Avatar user={{ avatar: '/demo/nurse1.jpg', role: 'nurse' }} size={64} /><h3>看護師</h3><p>担当患者のスケジュールを調整・登録。患者の状態をファイル付きで記録し、関係者全員に共有。</p></div>
          </div>
        </div>
      </section>

      <section id="reasons" className="lp-section">
        <div className="lp-inner">
          <p className="sec-en">REASONS</p>
          <h2 className="sec-title">P-CARE-MANAGEMENT が選ばれる理由</h2>
          <div className="reason-grid">
            {REASONS.map((r) => (
              <div className="reason" key={r.no}>
                <span className="reason-no">{r.no}</span>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="flow" className="lp-section lp-flow">
        <div className="lp-inner">
          <p className="sec-en">FLOW</p>
          <h2 className="sec-title">導入の流れ</h2>
          <ol className="flow">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="flow-no">STEP {i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="faq" className="lp-section">
        <div className="lp-inner narrow">
          <p className="sec-en">FAQ</p>
          <h2 className="sec-title">よくある質問</h2>
          <div className="faq">
            {FAQ.map((f, i) => (
              <div className={`faq-item ${open === i ? 'open' : ''}`} key={f.q}>
                <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  <span className="q">Q</span>{f.q}<IconChevronDown className="chev" />
                </button>
                {open === i && <p><span className="a">A</span>{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="lp-inner">
          <h2>在宅医療の現場を、もっとスムーズに。</h2>
          <p>アカウント登録は1分で完了します。まずはデモアカウントでお試しください。</p>
          <div className="hero-cta center">
            <Link className="btn btn-white btn-lg" to="/register">新規登録</Link>
            <Link className="btn btn-outline-white btn-lg" to="/login">ログイン</Link>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-inner">
          <Logo />
          <p>© {new Date().getFullYear()} P-CARE-MANAGEMENT（デモ版）</p>
        </div>
      </footer>
    </div>
  );
}
