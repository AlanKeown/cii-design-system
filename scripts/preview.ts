import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sirv from 'sirv';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Provide a valid preview port.');
}
const directory = resolve('build');
if (!existsSync(directory)) {
  throw new Error(
    'Build this application before starting its production preview.'
  );
}
// Serve the build under BASE_PATH (e.g. /repo/site) to mirror GitHub Pages.
const base = process.env.BASE_PATH ?? '';
const serve = sirv(directory, { dev: true, extensions: ['html'] });
const server = createServer((request, response) => {
  if (base) {
    const url = request.url ?? '/';
    if (
      url !== base &&
      !url.startsWith(`${base}/`) &&
      !url.startsWith(`${base}?`)
    ) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }
    request.url = url.slice(base.length) || '/';
  }
  serve(request, response);
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () =>
  console.log(`Local: http://localhost:${port}${base}/`)
);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
