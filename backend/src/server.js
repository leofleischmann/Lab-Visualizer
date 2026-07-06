import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const { app, db } = createApp();

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
