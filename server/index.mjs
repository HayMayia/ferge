import { createApp } from './app.mjs';

const port = Number(process.env.PORT || 3001);
const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`Smartfarm camera gateway listening on 0.0.0.0:${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
