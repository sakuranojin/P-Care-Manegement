import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { UPLOAD_DIR } from './db';
import { initRealtime } from './realtime';
import { migrate, seedIfEmpty } from './seed';
import account from './routes/account';
import comms from './routes/comms';
import care from './routes/care';
import board from './routes/board';
import { startScheduler } from './system';

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
// Order matters: routes that work without a unit come before the unit-only routers.
app.use('/api', account, comms, care, board);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

const clientDir = path.resolve(__dirname, '../../../client');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

seedIfEmpty();
migrate();
startScheduler();
const server = http.createServer(app);
initRealtime(server);
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`P-CARE-MANAGEMENT running on http://0.0.0.0:${port}`));
