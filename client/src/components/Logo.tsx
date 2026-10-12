import { Link } from 'react-router-dom';

/** Logo: a patient holding a schedule list. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#0f9b8e" />
      <circle cx="16" cy="13" r="5.5" fill="#fff" />
      <path d="M6.5 41c0-9.5 4-16.5 9.5-16.5 3.2 0 5.6 2 7 5" fill="#fff" />
      <path d="M16 30.5l6.5 3" stroke="#0b7a70" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="21.5" y="15.5" width="19" height="25" rx="3" fill="#fff" stroke="#0b7a70" strokeWidth="1.5" />
      <rect x="26.5" y="13.5" width="9" height="4.5" rx="1.6" fill="#f39c4a" />
      <path d="M25.5 24.5l1.4 1.4 2.4-2.6" stroke="#f39c4a" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31 24.5h6M25.5 30h11.5M25.5 35h8" stroke="#0f9b8e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ to = '/', size = 40 }: { to?: string; size?: number }) {
  return (
    <Link to={to} className="logo">
      <LogoMark size={size} />
      <span className="logo-text">
        P-CARE<span>-MANAGEMENT</span>
      </span>
    </Link>
  );
}
