import { spawn } from 'node:child_process';

const port = Number(process.env.CAROUSEL_BRAND_SUITE_PORT || 3104);
const server = spawn(process.execPath, [
  './outputs/server.mjs',
  `--port=${port}`,
  '--allow-private-urls'
], {
  cwd: new URL('../', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

try {
  await waitForServer(`http://localhost:${port}/api/carousel`);
  const environment = {
    ...process.env,
    CAROUSEL_BRAND_TEST_URL: `http://localhost:${port}/api/brand`,
    CAROUSEL_TEST_URL: `http://localhost:${port}/api/carousel`
  };
  const commands = [
    ['./evals/run-brand-evals.mjs'],
    ['./evals/run-brand-evals.mjs', '--dataset=heldout'],
    ['./tests/brand.integration.test.mjs'],
    ['./tests/api.integration.test.mjs'],
    ['./mcp/server.test.mjs']
  ];
  for (const argumentsList of commands) {
    const exitCode = await runNode(argumentsList, environment);
    if (exitCode) {
      process.exitCode = exitCode;
      break;
    }
  }
} finally {
  server.kill();
}

function runNode(argumentsList, environment) {
  const child = spawn(process.execPath, argumentsList, {
    cwd: new URL('../', import.meta.url),
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error(`Brand server exited before startup.\n${serverOutput}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Brand server did not start.\n${serverOutput}`);
}
