import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { createApp, loadConfig } from './src/app.js';
import { openDb } from './src/db.js';
import { mailer } from './src/mail.js';
import { stripeClient } from './src/stripe.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const cfg = loadConfig();
const app = createApp({ cfg, db: openDb(cfg.dbFile), mail: mailer(cfg), stripe: stripeClient(cfg.stripeKey) });
createServer(app).listen(cfg.port, () => console.log(`DANINK in ascolto su ${cfg.baseUrl} (porta ${cfg.port})`));
