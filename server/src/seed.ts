import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { db, now, save, timeJST, todayJST, uid, type User } from './db';
import type { Activity, Gender, Patient, Role, Visit } from '../../shared/types';
import { overlaps } from '../../shared/labels';

/** Demo staff photos live in client/public/demo; fall back to an illustrated avatar if missing. */
function photo(file: string, fallback: number) {
  const dirs = [path.resolve(__dirname, '../../../client/demo'), path.resolve(process.cwd(), 'client/public/demo')];
  return dirs.some((d) => fs.existsSync(path.join(d, file))) ? `/demo/${file}` : `preset:${fallback}`;
}

/** Bring data saved by earlier versions up to date (approval and board-read state did not exist). */
export function migrate() {
  let changed = false;
  for (const v of db.visits) {
    if (!v.approval) {
      Object.assign(v, { approval: 'approved', approvedAt: v.createdAt });
      changed = true;
    }
  }
  for (const p of db.posts) {
    if (!p.seenBy) {
      p.seenBy = db.users.filter((u) => u.unitId === p.unitId).map((u) => u.id);
      changed = true;
    }
  }
  if (changed) save();
}

/** Populate a demo unit on first boot so every screen has data to show. */
export function seedIfEmpty() {
  if (db.users.length || process.env.SEED_DEMO === 'false') return;
  const hash = bcrypt.hashSync('demo1234', 10);
  const unitId = uid();

  const mk = (email: string, name: string, gender: Gender, birthDate: string, role: Role, avatar: string, area: string, jobTitle: string, phone: string, inUnit = true): User => ({
    id: uid(), email, passwordHash: hash, name, gender, birthDate, role, avatar, jobTitle, phone, area,
    unitId: inUnit ? unitId : null, permission: inUnit ? (role === 'nurse' ? 'schedule_edit' : 'read_only') : null,
    manualStatus: 'waiting', profileCompleted: true, createdUnit: false, createdAt: now(),
  });

  const admin = { ...mk('admin@demo.jp', '佐藤 美咲', 'female', '1982-04-12', 'admin', photo('admin.jpg', 3), 'setagaya', '事務長', '03-5432-1100'), permission: 'owner' as const, createdUnit: true };
  const doctors = [
    mk('doctor@demo.jp', '田中 健一', 'male', '1975-09-03', 'doctor', photo('doctor1.jpg', 6), 'setagaya', '院長', '090-1234-5601'),
    mk('suzuki@demo.jp', '鈴木 誠', 'male', '1980-01-22', 'doctor', photo('doctor2.jpg', 9), 'shibuya', '訪問診療医', '090-1234-5602'),
    mk('takahashi@demo.jp', '高橋 由美', 'female', '1986-06-30', 'doctor', photo('doctor3.jpg', 2), 'suginami', '訪問診療医', '090-1234-5603'),
  ];
  const nurses = [
    mk('nurse@demo.jp', '伊藤 さくら', 'female', '1990-03-15', 'nurse', photo('nurse1.jpg', 4), 'setagaya', '看護主任', '080-2345-6701'),
    mk('watanabe@demo.jp', '渡辺 葵', 'female', '1994-11-08', 'nurse', photo('nurse2.jpg', 8), 'meguro', '訪問看護師', '080-2345-6702'),
    mk('yamamoto@demo.jp', '山本 翔太', 'male', '1992-07-19', 'nurse', photo('nurse3.jpg', 5), 'nakano', '訪問看護師', '080-2345-6703'),
    mk('nakamura@demo.jp', '中村 遥', 'female', '1997-02-27', 'nurse', photo('nurse4.jpg', 11), 'nerima', '訪問看護師', '080-2345-6704'),
  ];
  // Registered but not yet in a unit — use these to try the invitation flow.
  const outsiders = [
    mk('newdoctor@demo.jp', '小林 大輔', 'male', '1984-05-05', 'doctor', photo('doctor4.jpg', 10), 'ota', '訪問診療医', '090-9876-5401', false),
    mk('newnurse@demo.jp', '加藤 結衣', 'female', '1996-12-01', 'nurse', photo('nurse5.jpg', 7), 'shinagawa', '訪問看護師', '080-9876-5402', false),
  ];
  db.users.push(admin, ...doctors, ...nurses, ...outsiders);
  db.units.push({ id: unitId, name: 'さくら在宅ケアクリニック', address: '東京都世田谷区三軒茶屋2-14-8 さくらビル3F', ownerId: admin.id, createdAt: now() });

  // example.jp is reserved for documentation, so demo emails never reach real people.
  const romaji: Record<string, string> = { ヤマダ: 'yamada', キムラ: 'kimura', ハヤシ: 'hayashi', シミズ: 'shimizu', モリ: 'mori', イケダ: 'ikeda', ハシモト: 'hashimoto', イシイ: 'ishii' };
  const pt = (name: string, kana: string, gender: Gender, birthDate: string, address: string, area: string, phone: string, diagnosis: string, careLevel: string, notes: string, nurse: User, doctor: User): Patient => ({
    id: uid(), unitId, name, kana, gender, birthDate, address, area, phone, diagnosis, careLevel, notes, email: `${romaji[kana.split(' ')[0]] ?? 'patient'}@example.jp`,
    nurseIds: [nurse.id], doctorIds: [doctor.id], createdAt: now(),
  });
  const patients = [
    pt('山田 太郎', 'ヤマダ タロウ', 'male', '1938-02-11', '東京都世田谷区太子堂4-2-1', 'setagaya', '03-3411-2201', '慢性心不全', '要介護3', '塩分制限あり。体重を毎回測定。', nurses[0], doctors[0]),
    pt('木村 花子', 'キムラ ハナコ', 'female', '1942-08-25', '東京都渋谷区代々木3-18-6', 'shibuya', '03-3370-5512', '慢性閉塞性肺疾患（COPD）', '要介護2', '在宅酸素療法 2L/分。', nurses[1], doctors[1]),
    pt('林 正雄', 'ハヤシ マサオ', 'male', '1935-12-03', '東京都目黒区中目黒2-9-14', 'meguro', '03-3712-8840', '脳梗塞後遺症（右片麻痺）', '要介護4', '褥瘡予防のため体位変換。', nurses[1], doctors[0]),
    pt('清水 和子', 'シミズ カズコ', 'female', '1940-05-17', '東京都杉並区阿佐谷南1-22-3', 'suginami', '03-3315-0098', '2型糖尿病', '要介護1', 'インスリン自己注射の確認。', nurses[3], doctors[2]),
    pt('森 勇', 'モリ イサム', 'male', '1945-10-09', '東京都練馬区豊玉北5-7-2', 'nerima', '03-3991-4417', 'パーキンソン病', '要介護3', '転倒リスク高。', nurses[3], doctors[2]),
    pt('池田 キヨ', 'イケダ キヨ', 'female', '1931-01-30', '東京都大田区蒲田5-30-1', 'ota', '03-3731-6620', 'アルツハイマー型認知症', '要介護5', 'ご家族（長女）が主介護者。', nurses[0], doctors[1]),
    pt('橋本 進', 'ハシモト ススム', 'male', '1950-07-21', '東京都中野区中野4-11-5', 'nakano', '03-5345-2287', '肺がん（緩和ケア）', '要介護4', '疼痛コントロール中。', nurses[2], doctors[2]),
    pt('石井 恵子', 'イシイ ケイコ', 'female', '1948-03-04', '東京都新宿区西早稲田2-3-18', 'shinjuku', '03-3203-7745', '関節リウマチ', '要支援2', '関節痛の程度を記録。', nurses[2], doctors[1]),
  ];
  db.patients.push(...patients);

  // Visits from 10 days ago to 20 days ahead without double-booking.
  // Only visits that have already ended are "completed"; one happening right now is "in progress".
  const slots = ['09:00', '10:30', '13:00', '14:30', '16:00'];
  const end = (s: string) => `${String(Number(s.slice(0, 2)) + 1).padStart(2, '0')}${s.slice(2)}`;
  const purposes = ['定期訪問診療', '定期訪問診療', '処方調整', '血液検査', '状態確認・バイタル測定', '褥瘡処置'];
  const reports = [
    'バイタル安定（BP 128/76、SpO2 96%）。前回から大きな変化なし。内服継続。',
    '食欲やや低下。水分摂取を促すようご家族に指導。次回採血予定。',
    '疼痛コントロール良好。レスキュー使用1回/日。現行処方継続。',
    '浮腫軽度改善。体重 -0.8kg。利尿薬を継続。',
  ];
  const today = todayJST();
  const t = timeJST();
  let k = 0;
  for (let d = -10; d <= 20; d++) {
    const date = todayJST(d);
    if (new Date(date).getUTCDay() === 0) continue; // closed on Sundays
    const count = 3 + (Math.abs(d) % 3);
    for (let i = 0; i < count; i++, k++) {
      const p = patients[k % patients.length];
      const doctorId = p.doctorIds[0];
      const nurseId = p.nurseIds[0];
      const start = slots[(k * 2 + d + 20) % slots.length];
      const finish = end(start);
      if (db.visits.some((v) => v.date === date && (v.doctorId === doctorId || v.nurseId === nurseId) && overlaps(start, finish, v.startTime, v.endTime))) continue;
      const ended = date < today || (date === today && finish <= t);
      // A few recently ended visits are left without a report so the 未報告 (pending) state can be seen.
      const unreported = ended && date >= todayJST(-3) && k % 4 === 1;
      const done = ended && !unreported;
      const now_ = date === today && start <= t && t < finish;
      // Upcoming visits are approved by the doctor, except a few still awaiting approval.
      const approval = date > todayJST(2) && k % 5 === 0 ? 'pending' : 'approved';
      db.visits.push({
        id: uid(), unitId, patientId: p.id, doctorId, nurseId, date, startTime: start, endTime: finish, urgent: false,
        approval, approvedAt: approval === 'approved' ? now() : null,
        purpose: purposes[k % purposes.length], status: done ? 'completed' : now_ ? 'in_progress' : 'scheduled',
        report: done ? reports[k % reports.length] : '', attachments: [], completedAt: done ? now() : null,
        createdBy: nurseId, createdAt: now(),
      } satisfies Visit);
    }
  }

  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  db.patientUpdates.push(
    { id: uid(), patientId: patients[0].id, authorId: nurses[0].id, createdAt: ago(240), attachments: [], content: '本日の体重 58.2kg（前回比 +0.6kg）。下肢に軽度の浮腫あり。ご本人より息切れの訴えなし。水分摂取量は約1,200mL/日とのこと。ご家族には塩分を控えた食事を継続していただくよう再度説明しました。次回訪問時も体重と浮腫の程度を確認します。' },
    { id: uid(), patientId: patients[0].id, authorId: doctors[0].id, createdAt: ago(60), attachments: [], content: '利尿薬を朝1錠に増量。3日後に体重を再確認してください。' },
  );

  // Activity feed from the completed visits so the dashboard has history.
  const doctorName = (id: string) => db.users.find((u) => u.id === id)!.name;
  const recent = db.visits.filter((v) => v.status === 'completed').slice(-6);
  recent.forEach((v, i) => {
    const p = patients.find((x) => x.id === v.patientId)!;
    db.activities.push({ id: uid(), unitId, kind: 'visit_completed', text: `${doctorName(v.doctorId)}医師が${p.name}様の訪問を完了しました`, actorId: v.doctorId, patientId: p.id, userIds: [v.doctorId, v.nurseId], createdAt: ago(60 * (recent.length - i) + 15) } satisfies Activity);
  });
  db.activities.push({ id: uid(), unitId, kind: 'patient_update', text: `伊藤 さくら看護師が${patients[0].name}様の状態を記録しました`, actorId: nurses[0].id, patientId: patients[0].id, userIds: [nurses[0].id, doctors[0].id], createdAt: ago(240) });

  const g = { id: uid(), unitId, name: '訪問チーム連絡', direct: false, memberIds: [admin.id, doctors[0].id, nurses[0].id, nurses[1].id], pendingIds: [], createdBy: admin.id, createdAt: ago(600) };
  db.groups.push(g);
  const m1 = uid();
  db.messages.push(
    { id: m1, groupId: g.id, senderId: admin.id, text: 'おはようございます。本日の訪問予定をカレンダーに反映しました。', attachments: [], replyTo: null, createdAt: ago(180), readBy: g.memberIds },
    { id: uid(), groupId: g.id, senderId: doctors[0].id, text: '確認しました。山田様の訪問は伊藤さんと一緒に伺います。', attachments: [], replyTo: m1, createdAt: ago(150), readBy: g.memberIds },
    { id: uid(), groupId: g.id, senderId: nurses[0].id, text: '承知しました。体重測定の記録を事前に共有しておきます 👍', attachments: [], replyTo: null, createdAt: ago(30), readBy: [nurses[0].id, admin.id] },
  );
  db.broadcasts.push(
    { id: uid(), unitId, authorId: admin.id, title: '【重要】感染対策の徹底について', body: '訪問前後の手指消毒とマスク着用を引き続き徹底してください。発熱がある場合は出勤前に管理者へ連絡をお願いします。', createdAt: ago(1440), readBy: [admin.id] },
    { id: uid(), unitId, authorId: admin.id, title: '月例カンファレンスのお知らせ', body: '今月の多職種カンファレンスは第3水曜日 18:00〜 クリニック3階会議室で行います。', createdAt: ago(300), readBy: [admin.id] },
  );
  db.posts.push(
    { id: uid(), unitId, authorId: nurses[3].id, identity: 'anonymous', nickname: '', text: '夜間の緊急連絡の流れが分かりにくいと感じています。フローチャートなどで共有してもらえると助かります。', attachments: [], likes: [nurses[1].id, nurses[2].id], replies: [], createdAt: ago(2900) },
    { id: uid(), unitId, authorId: nurses[1].id, identity: 'real', nickname: '', text: '訪問バッグの中身を見直しました。パルスオキシメーターの予備電池を全バッグに追加しています。足りないものがあれば教えてください。', attachments: [], likes: [admin.id, nurses[0].id, doctors[0].id], replies: [{ id: uid(), authorId: nurses[0].id, identity: 'real', nickname: '', text: 'ありがとうございます！とても助かります。', createdAt: ago(1500) }], createdAt: ago(1560) },
    { id: uid(), unitId, authorId: doctors[0].id, identity: 'nickname', nickname: 'ルート改善係', text: '新しい訪問ルートにしてから移動時間が1日あたり約20分短縮できました。皆さんのご協力に感謝します。', attachments: [], likes: [admin.id], replies: [], createdAt: ago(200) },
    { id: uid(), unitId, authorId: admin.id, identity: 'real', nickname: '', text: '来月から電子カルテとの連携テストを開始します。ご意見・ご要望があればこの掲示板にコメントしてください。', attachments: [], likes: [], replies: [{ id: uid(), authorId: doctors[1].id, identity: 'anonymous', nickname: '', text: '処方履歴も参照できると嬉しいです。', createdAt: ago(20) }], createdAt: ago(45) },
  );
  // A registrant waiting for approval, so the Team screen shows a pending join request.
  db.joinRequests.push({ id: uid(), unitId, userId: outsiders[1].id, status: 'pending', createdAt: ago(90), decidedAt: null, decidedBy: null });
  // Everyone has already read the older posts; the newest one shows up as new on the 掲示板 menu.
  const everyoneIds = [admin, ...doctors, ...nurses].map((x) => x.id);
  db.posts.forEach((p, i, all) => (p.seenBy = i === all.length - 1 ? [p.authorId] : everyoneIds));
  save();
  console.log('Demo data created (password: demo1234)');
}
