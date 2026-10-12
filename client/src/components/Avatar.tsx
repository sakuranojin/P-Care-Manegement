import type { Permission, Role } from '@shared/types';
import { roleLabel } from '@shared/labels';

/** Two-colour avatar icons: [background, figure]. */
const PAIRS: [string, string][] = [
  ['#d4f0ec', '#0f9b8e'], ['#ffe4cf', '#e07b2a'], ['#dbe7ff', '#2b6fd6'], ['#fde0ec', '#d4497f'],
  ['#e6f4d7', '#4f9a2a'], ['#ece4ff', '#6c4fd0'], ['#d9f1fb', '#1c8bb8'], ['#fff1c9', '#b98a0b'],
  ['#f3e1d7', '#9a5a3c'], ['#e4e9ee', '#4a5a69'], ['#ffdede', '#cc4444'], ['#dff5ec', '#2a8f68'],
];
export const PRESET_COUNT = PAIRS.length;

function PresetFace({ n }: { n: number }) {
  const i = (n - 1 + PRESET_COUNT) % PRESET_COUNT;
  const [bg, fg] = PAIRS[i];
  const style = i % 3;
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <rect width="64" height="64" fill={bg} />
      <path d="M10 64 Q10 44 32 43 Q54 44 54 64Z" fill={fg} />
      <circle cx="32" cy="27" r="12" fill={fg} />
      {style === 1 && <path d="M19 28 Q18 13 32 13 Q46 13 45 28 L47 42 Q32 47 17 42Z" fill={fg} />}
      {style === 2 && <circle cx="32" cy="12.5" r="5.5" fill={fg} />}
      <rect x="27" y="36" width="10" height="9" rx="3" fill={fg} />
    </svg>
  );
}

/** Mark on every avatar: crown = 管理者, nurse cap = 看護師, stethoscope = 医師, 代 = 代理 (proxy). */
export function RoleMark({ role, proxy, size = 18 }: { role: Role; proxy?: boolean; size?: number }) {
  const color = proxy ? '#c8961a' : { admin: '#7c5cd6', nurse: '#e8659a', doctor: '#2b7de9' }[role];
  return (
    <span className="role-mark" style={{ width: size, height: size, background: color }} title={proxy ? `代理（${roleLabel[role]}）` : roleLabel[role]}>
      <svg viewBox="0 0 24 24" width="72%" height="72%" aria-hidden="true">
        {proxy ? (
          <text x="12" y="17.5" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff" fontFamily="sans-serif">代</text>
        ) : (
          <>
            {role === 'admin' && <path d="M3 18 L4.5 8 L9 12 L12 5 L15 12 L19.5 8 L21 18 Z" fill="#fff" />}
            {role === 'nurse' && (
              <>
                <path d="M3 16 L5 7.5 Q12 4 19 7.5 L21 16 Z" fill="#fff" />
                <path d="M12 8.5v5M9.5 11h5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
              </>
            )}
            {role === 'doctor' && (
              <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 3v5a4 4 0 0 0 8 0V3" />
                <path d="M9 12v2.5a4.5 4.5 0 0 0 9 0V12" />
                <circle cx="18" cy="10" r="2" fill="#fff" />
              </g>
            )}
          </>
        )}
      </svg>
    </span>
  );
}

/** Default avatar when no photo was uploaded: blue for male, pink for female. */
export function GenderFace({ gender }: { gender: 'male' | 'female' }) {
  const male = gender === 'male';
  const [bg, fg] = male ? ['#d9e8ff', '#2b6fd6'] : ['#ffe1ee', '#d4497f'];
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <rect width="64" height="64" fill={bg} />
      {!male && <path d="M18 30 Q17 12 32 12 Q47 12 46 30 L48 46 Q32 51 16 46Z" fill={fg} opacity=".75" />}
      <path d="M10 64 Q10 44 32 43 Q54 44 54 64Z" fill={fg} />
      <rect x="27" y="36" width="10" height="9" rx="3" fill={fg} />
      <circle cx="32" cy="27" r="12" fill={fg} />
      {male && <path d="M20 25 Q20 13 32 13 Q44 13 44 25 Q40 19 32 19 Q24 19 20 25Z" fill="#1d4f9e" />}
    </svg>
  );
}

export function AvatarImage({ avatar, size = 40 }: { avatar: string; size?: number }) {
  const preset = avatar?.startsWith('preset:') ? Number(avatar.slice(7)) : null;
  const gender = avatar === 'default:male' || avatar === 'default:female' ? (avatar.slice(8) as 'male' | 'female') : null;
  return (
    <span className="avatar-img" style={{ width: size, height: size }}>
      {gender ? <GenderFace gender={gender} />
        : preset != null || !avatar ? <PresetFace n={preset ?? 1} />
        : <img src={avatar} alt="" loading="lazy" />}
    </span>
  );
}

/** Patients always use a plain gray avatar. */
export function PatientAvatar({ size = 44 }: { size?: number }) {
  return (
    <span className="avatar patient-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width="100%" height="100%">
        <rect width="64" height="64" rx="32" fill="#e3e7ea" />
        <circle cx="32" cy="26" r="11" fill="#9aa5ae" />
        <path d="M12 58 Q12 40 32 40 Q52 40 52 58Z" fill="#9aa5ae" />
      </svg>
    </span>
  );
}

type AvatarUser ={ avatar: string; role: Role; name?: string; permission?: Permission | null };

export default function Avatar({ user, size = 40, showMark = true }: { user: AvatarUser; size?: number; showMark?: boolean }) {
  const proxy = user.permission === 'manager' && user.role !== 'admin';
  return (
    <span className="avatar" style={{ width: size, height: size }} title={user.name}>
      <AvatarImage avatar={user.avatar} size={size} />
      {showMark && <RoleMark role={user.role} proxy={proxy} size={Math.max(14, Math.round(size * 0.42))} />}
    </span>
  );
}
