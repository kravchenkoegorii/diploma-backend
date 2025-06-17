import { formatNumber } from './round-number';

export const formatUsd = (
  amount: number,
  price: number | undefined,
  currencyOptions?: any,
): string =>
  formatNumber(
    amount * (Number(price) || 0),
    currencyOptions || {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    },
  );
