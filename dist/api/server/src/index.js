"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = require("./db");
const realtime_1 = require("./realtime");
const seed_1 = require("./seed");
const account_1 = __importDefault(require("./routes/account"));
const comms_1 = __importDefault(require("./routes/comms"));
const care_1 = __importDefault(require("./routes/care"));
const board_1 = __importDefault(require("./routes/board"));
const system_1 = require("./system");
const app = (0, express_1.default)();
app.set('trust proxy', true);
app.use(express_1.default.json({ limit: '2mb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/uploads', express_1.default.static(db_1.UPLOAD_DIR, { maxAge: '7d' }));
// Order matters: routes that work without a unit come before the unit-only routers.
app.use('/api', account_1.default, comms_1.default, care_1.default, board_1.default);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
const clientDir = path_1.default.resolve(__dirname, '../../../client');
if (fs_1.default.existsSync(clientDir)) {
    app.use(express_1.default.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path_1.default.join(clientDir, 'index.html')));
}
(0, seed_1.seedIfEmpty)();
(0, seed_1.migrate)();
(0, system_1.startScheduler)();
const server = http_1.default.createServer(app);
(0, realtime_1.initRealtime)(server);
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`P-CARE-MANAGEMENT running on http://0.0.0.0:${port}`));
