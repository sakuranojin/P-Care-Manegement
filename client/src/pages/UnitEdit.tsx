import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { isManager, useAuth } from '../auth';
import { IconBuilding } from '../components/Icons';
import { fmtDateTime, useToast } from '../components/ui';

export default function UnitEdit() {
  const { user, unit, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(unit?.name ?? '');
  const [address, setAddress] = useState(unit?.address ?? '');
  // Proxies (代理) cannot change the unit.
  if (!unit || !isManager(user) || user?.role !== 'admin') return <Navigate to="/app" replace />;
  const save = async () => {
    try {
      await api('/units/mine', { name, address }, 'PUT');
      await refresh();
      toast('所属ユニットを更新しました');
    } catch (e: any) {
      toast(e.message, 'err');
    }
  };
  return (
    <div className="container narrow">
      <div className="page-head"><div><h1>所属ユニット編集</h1><p className="muted">作成日: {fmtDateTime(unit.createdAt)}</p></div></div>
      <section className="card">
        <h2 className="card-title"><IconBuilding />ユニット情報</h2>
        <div className="field"><label>ユニット名 <em>必須</em></label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>住所 <em>必須</em></label><input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <p className="muted small">※ 所属ユニットの作成は管理者1名につき1回のみです。ユニット内の情報はこのユニットに所属するメンバーにのみ表示されます。</p>
        <div className="row-end"><button className="btn btn-primary" onClick={save} disabled={!name.trim() || !address.trim()}>保存する</button></div>
      </section>
    </div>
  );
}
