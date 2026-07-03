import { createApp } from './app.js';
import { maybeSeedExample } from './seed.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const { app, db } = createApp();

// Beim allerersten Start ein Best-Practice-Beispielprojekt anlegen.
if (maybeSeedExample(db)) {
  console.log('Beispielprojekt „Homelab (Beispiel)" angelegt (erster Start).');
}

const server = app.listen(PORT, HOST, () => {
  console.log(`Lab Visualizer API läuft auf http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
