import { createHederaTopic } from '@clycites/hedera';

const network = process.env.HEDERA_NETWORK;
if (network !== 'testnet' && network !== 'previewnet') {
  throw new Error('Topic creation is restricted to HEDERA_NETWORK=testnet or previewnet');
}
if (!process.argv.includes('--acknowledge-network-cost')) {
  throw new Error('Pass --acknowledge-network-cost after reviewing the configured fee cap');
}
const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKey = process.env.HEDERA_OPERATOR_KEY;
if (!operatorId || !operatorKey)
  throw new Error('HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are required');

const topicId = await createHederaTopic({
  network: network === 'testnet' ? 'TESTNET' : 'PREVIEWNET',
  operatorId,
  operatorKey,
  memo: process.env.HEDERA_TOPIC_MEMO ?? 'ClyCites traceability integrity anchors',
  maxTransactionFeeHbar: Number.parseFloat(process.env.HEDERA_TOPIC_CREATE_MAX_FEE_HBAR ?? '2'),
  acknowledgeNetworkCost: true,
});
console.log(JSON.stringify({ network, topicId }, null, 2));
