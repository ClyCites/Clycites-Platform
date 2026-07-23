import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Next.js only auto-loads .env files from the app directory, but this monorepo
// keeps a single source of truth at the repository root. Load it here (before
// compilation inlines NEXT_PUBLIC_* values) without overriding platform-provided
// variables.
const loadRootEnv = (): void => {
  try {
    const content = readFileSync(resolve(process.cwd(), '../../.env'), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // The root .env is optional; the platform may inject variables directly.
  }
};

loadRootEnv();

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@clycites/contracts', '@clycites/ui'],
};

export default nextConfig;
