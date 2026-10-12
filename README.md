# P-CARE-MANAGEMENT（デモ版）

A DX service for home-visit medical teams (訪問診療・訪問看護), modelled on crosslog.life.
React + TypeScript (Vite) front end, Express + Socket.IO + TypeScript back end, one Node process.

## Run locally

```powershell
npm install
npm run dev          # API on :3000, web on http://localhost:5173 (hot reload)
# or production mode
npm run build
npm start            # http://localhost:3000
```

On first start a demo unit is created (disable with `SEED_DEMO=false`). Password for every demo account: `demo1234`.

| Account | Role |
|---|---|
| admin@demo.jp | 管理者 (unit owner) |
| doctor@demo.jp | 医師 |
| nurse@demo.jp | 看護師 |
| suzuki@demo.jp, takahashi@demo.jp | 医師 |
| watanabe@demo.jp, yamamoto@demo.jp, nakamura@demo.jp | 看護師 |
| newdoctor@demo.jp, newnurse@demo.jp | registered but not in a unit (use these to test invitations) |

## Environment variables

| Name | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP port (Railway sets this automatically) |
| `DATA_DIR` | `./data` | JSON database + uploaded files. Point at a persistent volume in production. |
| `JWT_SECRET` | auto-generated into `DATA_DIR/.jwt_secret` | Login token signing key |
| `SEED_DEMO` | `true` | Set `false` to start with an empty database |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | – | Optional. When set, invitations are also sent by email. |
| `PUBLIC_URL` | – | Link included in invitation emails |

## Deploy to Railway

1. Push this folder to a GitHub repository. `.gitignore` already keeps out `node_modules/`, `dist/`, `data/` (database, uploads, secrets), backups and `docs/`.
2. In Railway: **New Project → Deploy from GitHub repo**. `railway.json` sets the build (`npm run build`), start (`npm start`) and health check (`/api/health`); Node 22 comes from `engines` in `package.json`. Railway sets `PORT` itself.
3. Add a **Volume** to the service mounted at `/data`, and set the variable `DATA_DIR=/data`. Without a volume, the database and uploaded files are wiped on every redeploy.
4. Variables: `JWT_SECRET` (a long random string), `PUBLIC_URL` (the final URL, used in invitation emails). Optional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` to send patient emails; `SEED_DEMO=false` to start with no demo data.
5. **Settings → Networking → Generate Domain**, then edit the subdomain to `p-care-management` to get `p-care-management.up.railway.app` (if the name is free). A custom domain can be attached there too.
6. Every push to the default branch redeploys automatically; data on the volume is kept.

## Host on this Windows server

`deploy/windows/install.ps1` (run as Administrator) registers two boot-time scheduled tasks — the Node app on port 3000 and Caddy (`C:\caddy\caddy.exe`) as a reverse proxy on 80/443 with automatic HTTPS — and opens TCP 80/443 in Windows Firewall.

- URL: `https://p-care-management.103-179-45-80.sslip.io` (sslip.io maps the name to this server's IP; no domain purchase needed)
- Also reachable at `http://103.179.45.80`
- If the hosting provider has its own firewall / security group, allow inbound TCP 80 and 443 there as well.
- Logs: `data\server.log`. Stop: `Stop-ScheduledTask 'P-CARE-MANAGEMENT App'`.

## Behaviour and design decisions

- **Navigation**: left sidebar (bottom bar on phones). Patient and staff details open as in-page windows, never new browser windows.
- **Registration**: email + password + confirmation, then avatar (two-colour icons or an uploaded photo), name, gender, date of birth, role, phone number (required for doctors/nurses), job title and base area.
- **Unit access**: only 管理者 can create a unit, once. Doctors and nurses see nothing until they accept an invitation.
- **Permissions**: owner · 代理 (proxy, stored as `manager`; same capabilities as the administrator, only administrators can designate it, shown with a 「代」 mark on the avatar) · スケジュール編集 · 閲覧のみ.
- **Visits**: administrators never enter or edit appointments. The doctor is always the patient's attending physician; the booking nurse is recorded as the accompanying nurse. On a clash the AI moves the time to the nearest free slot (also when another nurse booked first, HTTP 409). Everyone related to the patient is notified when a visit is finalised. Demo visits are only "completed" once their end time has passed.
- **Urgent (緊急)**: ranks the unit's doctors by distance to the patient, availability right now and today's remaining load; the chosen doctor gets a direct-chat request, and the urgent visit is booked at the earliest free slot when the requester may schedule.
- **Staff status (automatic)**: 訪問中 (blue) when a visit is in progress, 待機中 (green) when logged in, 退勤 (gray) when not logged in. Only administrators can switch themselves to 取込中.
- **Dashboard**: admins/proxies see team size, users logged in now and patient count; doctors/nurses see only their own patients and visits. The filter button chooses doctor or nurse visits (illustrated options); 「スタッフ」 picks one doctor/nurse to filter the calendar. Clicking a date opens a small pop-up with incomplete visits first. The right column shows upcoming visits and an activity feed; below is the feedback board (posts with images, likes, replies; only the author can delete).
- **Patient records**: staff assignments are set when a patient is registered (nurses and administrators can register patients) and are read-only afterwards. Only the assigned doctor/nurse can add condition notes; long notes are truncated and open in a large window.
- **Chat**: direct messages connect immediately; groups created by owners/proxies connect immediately, others need approval. Discord-style layout with member list and status colours, double-click a message to reply, emoji picker, 既読 receipts.
- **Demo photos**: `client/public/demo/` — Pexels License stock photos, credits in `CREDITS.md`.
- **Distances** use area centroids (Tokyo wards and nearby cities), not geocoded addresses. The "AI" is a transparent scoring heuristic, not an LLM.
- **Storage**: a JSON file in `DATA_DIR` keeps the demo dependency-free. Swap for PostgreSQL before storing real patient data.- **Round 3**: 掲示板 is a top-level menu; posts/replies can be made with a nickname or anonymously (the server hides the author from everyone else); any file type can be attached and opens in an in-page viewer with a download button. Urgent requests are not available to administrators. Attending doctor/nurse can be changed when editing a patient; previous staff immediately lose access and upcoming visits are handed over. Individual notifications and per-staff patient counts are admin-only. Chat messages can be edited/deleted by their sender; groups can be deleted (creator/admin) and direct chats disconnected. Profiles cannot be changed after registration (password only). Patient email is mandatory and a visit notice (time + attending doctor) is emailed on add/change — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` to actually deliver; otherwise it is recorded in the patient's mail log only. Patients use a gray avatar.
