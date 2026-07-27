import { spawn } from 'node:child_process';

const port = Number(process.argv.find((argument) => argument.startsWith('--port='))?.split('=')[1] || 3000);
const child = spawn(process.execPath, ['./outputs/server.mjs', `--port=${port}`], {
  cwd: new URL('../', import.meta.url),
  detached: true,
  stdio: 'ignore',
  windowsHide: true
});
child.unref();
console.log(`Started Carousel Maker on port ${port} (PID ${child.pid}).`);
