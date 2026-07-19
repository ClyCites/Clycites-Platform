import { parseHederaEnvironment } from '@clycites/hedera';

const config = parseHederaEnvironment(process.env);

console.log(
  JSON.stringify(
    {
      valid: true,
      provider: config.HEDERA_PROVIDER,
      network: config.HEDERA_NETWORK,
      submissionEnabled: config.HEDERA_SUBMISSION_ENABLED,
      confirmationEnabled: config.HEDERA_CONFIRMATION_ENABLED,
      topicConfigured: Boolean(config.HEDERA_TOPIC_ID),
      operatorConfigured: Boolean(config.HEDERA_OPERATOR_ID && config.HEDERA_OPERATOR_KEY),
      mirrorNodeConfigured: Boolean(config.HEDERA_MIRROR_NODE_URL),
      referenceSecretVersion: config.HEDERA_REFERENCE_SECRET_VERSION,
      mainnetAcknowledged: config.HEDERA_MAINNET_ACKNOWLEDGEMENT === 'I_UNDERSTAND_MAINNET_CHARGES',
    },
    null,
    2,
  ),
);
