import { rm } from 'node:fs/promises';

await rm(new URL('../.next/types', import.meta.url), { force: true, recursive: true });
