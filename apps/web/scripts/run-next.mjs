import { spawn } from 'node:child_process';

const mode = process.argv[2];
if (mode !== 'build' && mode !== 'dev' && mode !== 'start') {
  throw new Error('Expected Next.js mode to be build, dev, or start');
}

const executable = process.platform === 'win32' ? 'next.cmd' : 'next';
const args = mode === 'build' ? [mode] : [mode, '--port', process.env.WEB_PORT ?? '3000'];
const child = spawn(executable, args, {
  env: {
    ...process.env,
    NODE_ENV: mode === 'dev' ? 'development' : 'production',
  },
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 1));
