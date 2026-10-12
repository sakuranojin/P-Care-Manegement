import { Navigate } from 'react-router-dom';
import type { Permission, PublicUser } from '@shared/types';
import { permissionLabel, roleLabel } from '@shared/labels';
import { api, useApi } from '../api';
import { isManager, useAuth } from '../auth';
import Avatar from '../components/Avatar';
import { StatusPill, useSort, useToast } from '../components/ui';

const OPTIONS: { value: Permission; desc: string }[] = [
  { value: 'schedule_edit', desc: '患者の訪問予定の追加・変更ができます' },
  { value: 'read_only', desc: '閲覧のみ。予定の編集はできません' },
  { value: 'manager', desc: '管理者と同等の権限（招待・権限付与・お知らせ送信など）。アバターに「代」マークが付きます。指定できるのは管理者のみ' },
];

export default function Permissions() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: team, reload } = useApi<PublicUser[]>('/team', ['team']);
  const rows = (team ?? []).filter((u) => u.role !== 'admin' || u.permission !== 'owner');
  const { sorted, th } = useSort(rows, { name: (u) => u.name, role: (u) => u.role, perm: (u) => u.permission ?? '' }, 'role');
  if (!isManager(user)) return <Navigate to="/app" replace />;

  const set = async (u: PublicUser, permission: Permission) => {
    try {
      await api(`/team/${u.id}/permission`, { permission }, 'PUT');
      toast(`${u.name}さんに「${permissionLabel[permission]}」を付与しました`);
      reload();
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };

  return (
    <div className="container">
      <div className="page-head"><div><h1>権限付与・代理指定</h1><p className="muted">所属ユニットの医師・看護師に権限を付与します。管理者は「代理」を指定できます。</p></div></div>
      <div className="perm-legend">
        {OPTIONS.map((o) => <div key={o.value} className={`perm-card pc-${o.value}`}><b>{permissionLabel[o.value]}</b><small>{o.desc}</small></div>)}
      </div>
      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th></th>{th('name', '氏名')}{th('role', '職種')}<th>ステータス</th>{th('perm', '権限')}</tr></thead>
            <tbody>
              {sorted.map((u) => (
                <tr key={u.id}>
                  <td><Avatar user={u} size={38} /></td>
                  <td><b>{u.name}</b><small className="block muted">{u.jobTitle}</small></td>
                  <td>{roleLabel[u.role]}</td>
                  <td><StatusPill status={u.status} /></td>
                  <td>
                    <div className="seg seg-sm">
                      {OPTIONS.map((o) => (
                        <button key={o.value} className={u.permission === o.value ? `active perm-${o.value}` : ''} onClick={() => u.permission !== o.value && set(u, o.value)}
                          disabled={u.id === user?.id || (user?.role !== 'admin' && (o.value === 'manager' || u.permission === 'manager'))}>
                          {permissionLabel[o.value]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
