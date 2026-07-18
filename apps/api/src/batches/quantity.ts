const QUANTITY_DECIMALS = 4;
const QUANTITY_SCALE = 10n ** BigInt(QUANTITY_DECIMALS);

export const toQuantityUnits = (value: string): bigint => {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(QUANTITY_DECIMALS, '0'));
};

export const formatQuantity = (value: bigint): string => {
  const whole = value / QUANTITY_SCALE;
  const fraction = (value % QUANTITY_SCALE).toString().padStart(QUANTITY_DECIMALS, '0');
  return `${whole}.${fraction}`;
};
