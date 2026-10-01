import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

// anchor-coverage.spec.ts asserts over the outbox events emitted by every other spec, so it must
// run after them. The default sequencer reorders files by cached duration, which breaks that.
class AnchorCoverageLastSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = await super.sort(files);
    const isAnchorCoverage = (file: TestSpecification) =>
      file.moduleId.endsWith('/anchor-coverage.spec.ts');
    return [
      ...sorted.filter((file) => !isAnchorCoverage(file)),
      ...sorted.filter(isAnchorCoverage),
    ];
  }
}

export default defineConfig({
  test: {
    env: {
      HEDERA_CONFIRMATION_ENABLED: 'false',
      HEDERA_NETWORK: 'local',
      HEDERA_PROVIDER: 'mock',
      HEDERA_SUBMISSION_ENABLED: 'false',
    },
    fileParallelism: false,
    globalSetup: ['./test/assert-database-history.ts'],
    sequence: { sequencer: AnchorCoverageLastSequencer },
  },
});
