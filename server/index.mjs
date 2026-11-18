import { loadEnvFile } from 'node:process';
import { createApp } from './app.mjs';

// Loading inside the process avoids Node 22's --watch error when an optional
// --env-file-if-exists path does not exist in a fresh checkout.
try {
  loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';

const port = Number(process.env.PORT || 3001);
const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`Smartfarm camera gateway listening on 0.0.0.0:${port}`);
  if (!process.env.GATEWAY_TOKEN)
    console.log(
      'Local trusted-network mode: no access key. Do not expose this gateway to the internet.',
    );
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
