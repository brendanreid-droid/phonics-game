/**
 * Runs a TypeScript script that imports the workspace packages.
 *
 * Node cannot load them directly: the packages import each other with
 * extensionless specifiers (`./types`), which its ESM resolver rejects. Vite is
 * already a dependency and resolves them exactly as the app and the tests do,
 * so the generator sees the same curriculum the game does rather than a second
 * copy parsed some other way.
 */
import { createServer } from 'vite';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/lib/run-ts.mjs <script.ts>');
  process.exit(1);
}

const server = await createServer({
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
});
try {
  await server.ssrLoadModule(target);
} finally {
  await server.close();
}
