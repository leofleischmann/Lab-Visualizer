import { createApp } from './app.js';
import { purgeExpiredSessions } from './db.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const { app, db } = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`Lab Visualizer API läuft auf http://${HOST}:${PORT}`);
});

// Abgelaufene Sessions regelmäßig aufräumen (stündlich). unref → hält den Prozess
// nicht künstlich am Leben und blockiert kein sauberes Herunterfahren.
const sessionCleanup = setInterval(() => {
  try {
    purgeExpiredSessions(db);
  } catch (err) {
    console.error('Session-Cleanup fehlgeschlagen:', err);
  }
}, 60 * 60 * 1000);
sessionCleanup.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(sessionCleanup);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
