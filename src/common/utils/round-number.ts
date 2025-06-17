import Decimal from 'decimal.js';

export const formatNumber = (
  value: string | number | undefined,
  options: Intl.NumberFormatOptions = {
    maximumFractionDigits: 5,
    minimumFractionDigits: 1,
  },
) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    value = Number(value);
  }

  if (value > 1) {
    value = value.toFixed(2);
  }

  return new Intl.NumberFormat('en-US', options).format(+value);
};

export const formatNumberForResponse = (
  balance: string | number | undefined,
) => {
  if (balance === null || balance === undefined) {
    return '';
  }

  if (typeof balance === 'number') {
    balance = balance.toString();
  }

  if (isExponential(balance)) {
    const decimalNumber = new Decimal(balance);
    balance = decimalNumber.toFixed();
  }

  const num = parseFloat(balance);
  const [intPart, fracPart = ''] = balance.split('.');

  if (!fracPart || /^0*$/.test(fracPart)) {
    return num.toFixed(2);
  }

  const firstNonZeroIndex = fracPart.search(/[1-9]/);

  const cutIndex = firstNonZeroIndex + 2;

  if (cutIndex >= fracPart.length) {
    return `${intPart}.${fracPart}`;
  }

  const trimmedFrac = fracPart.slice(0, cutIndex);
  return `${intPart}.${trimmedFrac}`;
};

function isExponential(num: string): boolean {
  return num.includes('e');
}
