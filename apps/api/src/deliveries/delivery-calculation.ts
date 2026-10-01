import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { DeliveryPricingInput, DeliveryWeight } from '@clycites/contracts';

const QUANTITY_SCALE = 10_000n;

const scaledInteger = (value: string, decimalPlaces: number): bigint => {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(decimalPlaces) + BigInt(fraction.padEnd(decimalPlaces, '0'));
};

const formatScaled = (value: bigint, decimalPlaces: number): string => {
  const scale = 10n ** BigInt(decimalPlaces);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimalPlaces, '0');
  return `${whole}.${fraction}`;
};

export interface CalculatedWeight {
  grossQuantity: string | null;
  tareQuantity: string | null;
  netQuantity: string;
  unit: 'KG';
  captureMethod: 'MANUAL';
}

export const calculateWeight = (input: DeliveryWeight): CalculatedWeight => {
  if (input.mode === 'DIRECT_NET') {
    return {
      grossQuantity: null,
      tareQuantity: null,
      netQuantity: formatScaled(scaledInteger(input.netQuantity, 4), 4),
      unit: input.unit,
      captureMethod: input.captureMethod,
    };
  }
  const gross = scaledInteger(input.grossQuantity, 4);
  const tare = scaledInteger(input.tareQuantity, 4);
  if (tare >= gross) {
    throw new UnprocessableEntityException({
      code: 'INVALID_WEIGHT',
      message: 'Tare quantity must be less than gross quantity',
    });
  }
  const net = gross - tare;
  const netQuantity = formatScaled(net, 4);
  if (input.clientNetQuantity) {
    const clientNet = scaledInteger(input.clientNetQuantity, 4);
    const delta = clientNet > net ? clientNet - net : net - clientNet;
    if (delta > 1n) {
      throw new ConflictException({
        code: 'SERVER_CALCULATION_MISMATCH',
        message: 'Client net quantity does not match the server calculation',
      });
    }
  }
  return {
    grossQuantity: formatScaled(gross, 4),
    tareQuantity: formatScaled(tare, 4),
    netQuantity,
    unit: input.unit,
    captureMethod: input.captureMethod,
  };
};

export interface CalculatedPricing {
  unitPriceMinor: bigint;
  currency: 'UGX';
  quantity: string;
  quantityUnit: 'KG';
  grossAmountMinor: bigint;
  adjustmentAmountMinor: bigint;
  netAmountMinor: bigint;
  priceSource: DeliveryPricingInput['priceSource'];
  priceReference: string | null;
  overrideReason: string | null;
}

export const calculatePricing = (
  netQuantity: string,
  input: DeliveryPricingInput,
): CalculatedPricing => {
  const quantity = scaledInteger(netQuantity, 4);
  const unitPriceMinor = BigInt(input.unitPriceMinor);
  const adjustmentAmountMinor = BigInt(input.adjustmentAmountMinor);
  const grossAmountMinor = (quantity * unitPriceMinor + QUANTITY_SCALE / 2n) / QUANTITY_SCALE;
  const netAmountMinor = grossAmountMinor + adjustmentAmountMinor;
  if (netAmountMinor < 0n) {
    throw new UnprocessableEntityException({
      code: 'INVALID_PRICE',
      message: 'Pricing adjustments cannot produce a negative net amount',
    });
  }
  if (
    (input.clientGrossAmountMinor && BigInt(input.clientGrossAmountMinor) !== grossAmountMinor) ||
    (input.clientNetAmountMinor && BigInt(input.clientNetAmountMinor) !== netAmountMinor)
  ) {
    throw new ConflictException({
      code: 'SERVER_CALCULATION_MISMATCH',
      message: 'Client monetary totals do not match the server calculation',
    });
  }
  return {
    unitPriceMinor,
    currency: input.currency,
    quantity: formatScaled(quantity, 4),
    quantityUnit: 'KG',
    grossAmountMinor,
    adjustmentAmountMinor,
    netAmountMinor,
    priceSource: input.priceSource,
    priceReference: input.priceReference ?? null,
    overrideReason: input.overrideReason ?? null,
  };
};
