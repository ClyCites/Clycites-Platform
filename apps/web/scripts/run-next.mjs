import { spawn } from 'node:child_process';

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'start') {
  throw new Error('Expected Next.js mode to be dev or start');
}

const executable = process.platform === 'win32' ? 'next.cmd' : 'next';
const child = spawn(executable, [mode, '--port', process.env.WEB_PORT ?? '3000'], {
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 1));
