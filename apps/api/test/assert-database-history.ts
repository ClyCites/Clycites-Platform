import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

export default async function assertDatabaseHistory(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for API tests. Use the migration-only clycites_wp1_history database.',
    );
  }
  if (!process.env.SHADOW_DATABASE_URL) {
    throw new Error('SHADOW_DATABASE_URL is required to verify API test database history.');
  }

  try {
    await execFileAsync(
      'pnpm',
      [
        '--filter',
        '@clycites/database',
        'exec',
        'prisma',
        'migrate',
        'diff',
        '--from-migrations',
        './prisma/migrations',
        '--to-config-datasource',
        '--exit-code',
      ],
      {
        cwd: repositoryRoot,
        env: process.env,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch (error) {
    const output =
      error instanceof Error && 'stdout' in error && typeof error.stdout === 'string'
        ? error.stdout.trim()
        : '';
    throw new Error(
      [
        'API tests require a database built solely from this branch migration history.',
        'Set DATABASE_URL to the isolated clycites_wp1_history database.',
        output,
      ]
        .filter(Boolean)
        .join('\n\n'),
      { cause: error },
    );
  }
}
