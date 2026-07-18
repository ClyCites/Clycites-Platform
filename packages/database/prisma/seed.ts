import { createDatabaseClient } from '../src/index.js';

const database = createDatabaseClient();

try {
  await database.systemSetting.upsert({
    where: { key: 'platform.foundation.version' },
    update: { value: { version: 1 } },
    create: { key: 'platform.foundation.version', value: { version: 1 } },
  });
} finally {
  await database.$disconnect();
}
