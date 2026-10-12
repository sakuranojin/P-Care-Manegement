import { useApi } from '../api';
import Board from '../components/Board';
import type { PublicUser } from '@shared/types';

export default function BoardPage() {
  const { data: team } = useApi<PublicUser[]>('/team', ['team']);
  return (
    <div className="container board-page">
      <div className="page-head">
        <div>
          <h1>掲示板</h1>
          <p className="muted">チーム全員が閲覧できる意見交換の場です。ニックネームや匿名でも投稿できます。</p>
        </div>
      </div>
      <Board team={team ?? []} />
    </div>
  );
}
