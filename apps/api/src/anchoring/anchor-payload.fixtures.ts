// Deterministic stand-ins for every database row an anchor payload builder reads.
//
// Every fixture row is deliberately contaminated with the values in SENSITIVE_VALUES. A payload
// builder that widens a Prisma `include`, spreads a row, or forwards a nested relation will carry
// those values into the canonical payload, where the privacy test will see them. Fixtures are
// therefore intentionally wider than the fields the builders read today.
import { Prisma } from '@clycites/database';

/**
 * Values that must never appear in a canonical payload or in a Hedera message. Keys are labels for
 * assertion messages; the values are what is searched for in the serialised bytes.
 */
export const SENSITIVE_VALUES = {
  farmerFullName: 'Amina Nakato',
  farmerNumber: 'FRM-KIS-2026-0001',
  primaryPhone: '+256700000001',
  alternativePhone: '+256700000002',
  emailAddress: 'amina.nakato@farmers.example',
  nationalIdentifier: 'CF90210123ABCD',
  dateOfBirth: '1984-02-11',
  latitude: '0.34761234',
  longitude: '32.58251234',
  plotBoundary: 'POLYGON((32.58 0.34,32.59 0.34,32.59 0.35,32.58 0.35,32.58 0.34))',
  postalAddress: 'Plot 14 Nakivubo Road',
  district: 'Kisoro District',
  subCounty: 'Nyarusiza Sub-County',
  parish: 'Gasovu Parish',
  village: 'Kabaya Village',
  deviceImei: '353918090812345',
  bankAccountNumber: '9021340017788',
  mobileMoneyNumber: '+256770123456',
} as const;

/**
 * Spread into every fixture row and every nested relation. This is what a careless `include` or an
 * accidental `...row` spread would leak.
 */
const contamination = {
  farmerFullName: SENSITIVE_VALUES.farmerFullName,
  farmerNumber: SENSITIVE_VALUES.farmerNumber,
  primaryPhone: SENSITIVE_VALUES.primaryPhone,
  alternativePhone: SENSITIVE_VALUES.alternativePhone,
  email: SENSITIVE_VALUES.emailAddress,
  nationalId: SENSITIVE_VALUES.nationalIdentifier,
  dateOfBirth: SENSITIVE_VALUES.dateOfBirth,
  latitude: SENSITIVE_VALUES.latitude,
  longitude: SENSITIVE_VALUES.longitude,
  boundary: SENSITIVE_VALUES.plotBoundary,
  address: SENSITIVE_VALUES.postalAddress,
  district: SENSITIVE_VALUES.district,
  subCounty: SENSITIVE_VALUES.subCounty,
  parish: SENSITIVE_VALUES.parish,
  village: SENSITIVE_VALUES.village,
  deviceImei: SENSITIVE_VALUES.deviceImei,
  bankAccountNumber: SENSITIVE_VALUES.bankAccountNumber,
  mobileMoneyNumber: SENSITIVE_VALUES.mobileMoneyNumber,
};

const decimal = (value: string) => new Prisma.Decimal(value);
const at = (iso: string) => new Date(iso);

export const ORGANIZATION_ID = '00000000-0000-4000-8000-0000000a0001';
export const FARMER_ID = '00000000-0000-4000-8000-0000000a0002';
export const BUYER_ORGANIZATION_ID = '00000000-0000-4000-8000-0000000a0003';
export const EVENT_ID = '00000000-0000-4000-8000-0000000a0004';

const DELIVERY_ID = '00000000-0000-4000-8000-0000000b0001';
const BATCH_ID = '00000000-0000-4000-8000-0000000b0002';
const TRANSFORMATION_ID = '00000000-0000-4000-8000-0000000b0003';
const LOT_ID = '00000000-0000-4000-8000-0000000b0004';
const CUSTODY_TRANSFER_ID = '00000000-0000-4000-8000-0000000b0005';
const LISTING_ID = '00000000-0000-4000-8000-0000000b0006';
const OFFER_ID = '00000000-0000-4000-8000-0000000b0007';
const CONTRACT_ID = '00000000-0000-4000-8000-0000000b0008';
const ORDER_ID = '00000000-0000-4000-8000-0000000b0009';
const ACCEPTANCE_ID = '00000000-0000-4000-8000-0000000b000a';
const SETTLEMENT_ID = '00000000-0000-4000-8000-0000000b000b';
const STATEMENT_ID = '00000000-0000-4000-8000-0000000b000c';
const RECONCILIATION_ID = '00000000-0000-4000-8000-0000000b000d';
const PAYMENT_INSTRUCTION_ID = '00000000-0000-4000-8000-0000000b000e';
const OUTPUT_BATCH_ID = '00000000-0000-4000-8000-0000000b000f';
const RECORD_ID = '00000000-0000-4000-8000-0000000b0010';
const REPLACEMENT_TRANSFORMATION_ID = '00000000-0000-4000-8000-0000000b0011';

export const ENTITY_IDS = {
  DELIVERY: DELIVERY_ID,
  BATCH: BATCH_ID,
  TRANSFORMATION: TRANSFORMATION_ID,
  LOT: LOT_ID,
  CUSTODY_TRANSFER: CUSTODY_TRANSFER_ID,
  LISTING: LISTING_ID,
  OFFER: OFFER_ID,
  CONTRACT: CONTRACT_ID,
  ORDER: ORDER_ID,
  ACCEPTANCE: ACCEPTANCE_ID,
  SETTLEMENT: SETTLEMENT_ID,
  STATEMENT: STATEMENT_ID,
  RECONCILIATION: RECONCILIATION_ID,
  RECORD: RECORD_ID,
  REPLACEMENT_TRANSFORMATION: REPLACEMENT_TRANSFORMATION_ID,
} as const;

const qualityMeasurements = [
  {
    ...contamination,
    qualityAttributeDefinition: { ...contamination, code: 'MOISTURE_CONTENT' },
    decimalValue: decimal('11.5'),
    integerValue: null,
    textValue: `Inspector note for ${SENSITIVE_VALUES.farmerFullName}`,
    enumValue: null,
    booleanValue: null,
  },
  {
    ...contamination,
    qualityAttributeDefinition: { ...contamination, code: 'DEFECT_COUNT' },
    decimalValue: null,
    integerValue: 3,
    textValue: null,
    enumValue: null,
    booleanValue: null,
  },
];

export const delivery = {
  ...contamination,
  id: DELIVERY_ID,
  publicId: 'DEL-KIS-2026-0001',
  organizationId: ORGANIZATION_ID,
  farmerId: FARMER_ID,
  status: 'ACCEPTED',
  acceptedAt: at('2026-02-01T08:00:00.000Z'),
  version: 3,
  commodity: { ...contamination, code: 'COFFEE_ARABICA' },
  commodityForm: { ...contamination, code: 'CHERRY' },
  measurements: [{ ...contamination, netQuantity: decimal('30'), unit: 'KG' }],
  qualityMeasurements,
  receipts: [{ ...contamination, checksum: `sha256:${'a'.repeat(64)}` }],
};

export const produceBatch = {
  ...contamination,
  id: BATCH_ID,
  publicId: 'BAT-KIS-2026-0001',
  organizationId: ORGANIZATION_ID,
  status: 'SEALED',
  initialQuantity: decimal('50'),
  quantityUnit: 'KG',
  sealedAt: at('2026-02-02T08:00:00.000Z'),
  commodity: { ...contamination, code: 'COFFEE_ARABICA' },
  commodityForm: { ...contamination, code: 'CHERRY' },
  farmerContributions: [
    { ...contamination, deliveryId: DELIVERY_ID, quantity: decimal('30') },
    { ...contamination, deliveryId: `${DELIVERY_ID.slice(0, -1)}2`, quantity: decimal('20') },
  ],
};

export const batchTransformation = {
  ...contamination,
  id: TRANSFORMATION_ID,
  organizationId: ORGANIZATION_ID,
  type: 'TRANSFORMATION',
  status: 'COMPLETED',
  completedAt: at('2026-02-03T08:00:00.000Z'),
  supersededAt: at('2026-02-04T08:00:00.000Z'),
  supersessionReason: `Reweighed after ${SENSITIVE_VALUES.farmerFullName} disputed the yield`,
  inputs: [{ ...contamination, batchId: BATCH_ID, quantity: decimal('50') }],
  outputs: [
    { ...contamination, batchId: OUTPUT_BATCH_ID, quantity: decimal('10'), unit: 'KG' },
  ],
};

export const cooperativeLot = {
  ...contamination,
  id: LOT_ID,
  publicId: 'LOT-KIS-2026-0001',
  organizationId: ORGANIZATION_ID,
  status: 'APPROVED',
  quantity: decimal('10'),
  quantityUnit: 'KG',
  commodity: { ...contamination, code: 'COFFEE_ARABICA' },
  commodityForm: { ...contamination, code: 'PARCHMENT' },
  contributions: [{ ...contamination, batchId: OUTPUT_BATCH_ID, quantity: decimal('10') }],
  inspections: [{ ...contamination, measurements: qualityMeasurements }],
};

export const custodyTransfer = {
  ...contamination,
  id: CUSTODY_TRANSFER_ID,
  status: 'RECEIVED',
  receivedAt: at('2026-02-04T08:00:00.000Z'),
  fromOrganizationId: ORGANIZATION_ID,
  toOrganizationId: BUYER_ORGANIZATION_ID,
  lotId: LOT_ID,
  quantity: decimal('10'),
  quantityUnit: 'KG',
};

export const marketplaceListing = {
  ...contamination,
  id: LISTING_ID,
  publicId: 'LST-KIS-2026-0001',
  sellerOrganizationId: ORGANIZATION_ID,
  publishedAt: at('2026-02-05T08:00:00.000Z'),
  listedQuantity: decimal('10'),
  quantityUnit: 'KG',
  currency: 'UGX',
  pricingMethod: 'FIXED',
  version: 1,
  lot: { ...contamination, publicId: 'LOT-KIS-2026-0001' },
};

export const offer = {
  ...contamination,
  id: OFFER_ID,
  publicId: 'OFR-KIS-2026-0001',
  sellerOrganizationId: ORGANIZATION_ID,
  buyerOrganizationId: BUYER_ORGANIZATION_ID,
  listingId: LISTING_ID,
  status: 'ACCEPTED',
  respondedAt: at('2026-02-06T08:00:00.000Z'),
  quantity: decimal('10'),
  quantityUnit: 'KG',
  unitPriceMinor: 1_200_000n,
  currency: 'UGX',
  totalAmountMinor: 12_000_000n,
};

export const salesContract = {
  ...contamination,
  id: CONTRACT_ID,
  publicId: 'CTR-KIS-2026-0001',
  sellerOrganizationId: ORGANIZATION_ID,
  buyerOrganizationId: BUYER_ORGANIZATION_ID,
  lotId: LOT_ID,
  status: 'ACTIVE',
  activatedAt: at('2026-02-07T08:00:00.000Z'),
  quantity: decimal('10'),
  quantityUnit: 'KG',
  totalAmountMinor: 12_000_000n,
  currency: 'UGX',
  version: 2,
};

export const salesOrder = {
  ...contamination,
  id: ORDER_ID,
  publicId: 'ORD-KIS-2026-0001',
  sellerOrganizationId: ORGANIZATION_ID,
  buyerOrganizationId: BUYER_ORGANIZATION_ID,
  contractId: CONTRACT_ID,
  lotId: LOT_ID,
  custodyTransferId: CUSTODY_TRANSFER_ID,
  quantity: decimal('10'),
  quantityUnit: 'KG',
  status: 'COMPLETED',
  version: 4,
  dispatchedAt: at('2026-02-08T08:00:00.000Z'),
  receivedAt: at('2026-02-09T08:00:00.000Z'),
  completedAt: at('2026-02-10T08:00:00.000Z'),
};

export const buyerAcceptance = {
  ...contamination,
  id: ACCEPTANCE_ID,
  orderId: ORDER_ID,
  decision: 'ACCEPTED',
  acceptedQuantity: decimal('10'),
  unit: 'KG',
  decidedAt: at('2026-02-09T09:00:00.000Z'),
  order: { ...salesOrder },
};

export const settlementRun = {
  ...contamination,
  id: SETTLEMENT_ID,
  organizationId: ORGANIZATION_ID,
  status: 'APPROVED',
  approvedAt: at('2026-02-11T08:00:00.000Z'),
  currency: 'UGX',
  sourceTotalMinor: 12_000_000n,
  deductionsTotalMinor: 500_000n,
  adjustmentsTotalMinor: 0n,
  netSettlementTotalMinor: 11_500_000n,
  calculationVersion: '1.0',
  roundingPolicyVersion: '1.0',
  lineageSnapshotHash: `sha256:${'b'.repeat(64)}`,
  version: 5,
};

export const farmerStatement = {
  ...contamination,
  id: STATEMENT_ID,
  status: 'ACTIVE',
  checksum: `sha256:${'c'.repeat(64)}`,
  version: 1,
  issuedAt: at('2026-02-12T08:00:00.000Z'),
  farmerSettlement: {
    ...contamination,
    organizationId: ORGANIZATION_ID,
    settlementRunId: SETTLEMENT_ID,
  },
};

export const paymentReconciliation = {
  ...contamination,
  id: RECONCILIATION_ID,
  organizationId: ORGANIZATION_ID,
  status: 'CONFIRMED',
  reviewedAt: at('2026-02-13T08:00:00.000Z'),
  currency: 'UGX',
  amountMinor: 11_500_000n,
  valueDate: at('2026-02-13T00:00:00.000Z'),
  // Free-form operator evidence is the most likely place for personal data to arrive.
  evidenceMetadata: { reference: 'MM-9981', payee: SENSITIVE_VALUES.mobileMoneyNumber },
  paymentInstructionId: PAYMENT_INSTRUCTION_ID,
  paymentInstruction: { ...contamination, id: PAYMENT_INSTRUCTION_ID },
};

const rows: Record<string, unknown> = {
  delivery,
  produceBatch,
  batchTransformation,
  cooperativeLot,
  custodyTransfer,
  marketplaceListing,
  offer,
  salesContract,
  salesOrder,
  buyerAcceptance,
  settlementRun,
  farmerStatement,
  paymentReconciliation,
};

/**
 * A transaction client that answers `findUnique` from the contaminated fixtures. The `where.id`
 * clause is honoured: asking a model for an identifier that belongs to a different aggregate
 * returns null, exactly as PostgreSQL would. Without that, a builder that looks up the wrong model
 * would appear to work here while returning null in production.
 */
export function createFixtureTransaction(): Prisma.TransactionClient {
  const client: Record<
    string,
    { findUnique: (arguments_: { where: { id?: string } }) => Promise<unknown> }
  > = {};
  for (const [model, row] of Object.entries(rows)) {
    client[model] = {
      findUnique: ({ where }) =>
        Promise.resolve(where.id === (row as { id: string }).id ? row : null),
    };
  }
  return client as unknown as Prisma.TransactionClient;
}
