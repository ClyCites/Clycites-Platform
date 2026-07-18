import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MockHederaAnchorProvider,
  MockHederaLedger,
  MockMirrorProvider,
  RestMirrorProvider,
  SdkHederaAnchorProvider,
  type HederaAnchorProvider,
  type HederaMirrorProvider,
} from '@clycites/hedera';

import type { WorkerEnvironment } from './environment.js';

@Injectable()
export class HederaProviderService implements OnModuleDestroy {
  readonly anchor: HederaAnchorProvider;
  readonly mirror: HederaMirrorProvider;
  private readonly sdkProvider?: SdkHederaAnchorProvider;

  constructor(@Inject(ConfigService) config: ConfigService<WorkerEnvironment, true>) {
    const topicId = config.getOrThrow('HEDERA_TOPIC_ID', { infer: true });
    if (config.getOrThrow('HEDERA_PROVIDER', { infer: true }) === 'mock') {
      const ledger = new MockHederaLedger(topicId);
      this.anchor = new MockHederaAnchorProvider(ledger);
      this.mirror = new MockMirrorProvider(ledger);
      return;
    }
    const networkValue = config.getOrThrow('HEDERA_NETWORK', { infer: true });
    const network =
      networkValue === 'testnet'
        ? 'TESTNET'
        : networkValue === 'previewnet'
          ? 'PREVIEWNET'
          : 'MAINNET';
    this.mirror = new RestMirrorProvider({
      baseUrl: config.getOrThrow('HEDERA_MIRROR_NODE_URL', { infer: true }),
      network,
      timeoutMs:
        config.getOrThrow('HEDERA_CONFIRMATION_POLL_INTERVAL_SECONDS', { infer: true }) * 1_000,
      maxResponseBytes: 1_000_000,
    });
    this.sdkProvider = new SdkHederaAnchorProvider(
      {
        network,
        operatorId: config.getOrThrow('HEDERA_OPERATOR_ID', { infer: true }),
        operatorKey: config.getOrThrow('HEDERA_OPERATOR_KEY', { infer: true }),
        usdPerHbar: config.getOrThrow('HEDERA_USD_PER_HBAR', { infer: true }),
        requestTimeoutMs: 30_000,
      },
      this.mirror,
    );
    this.anchor = this.sdkProvider;
  }

  onModuleDestroy(): void {
    this.sdkProvider?.close();
  }
}
