export function formatTxAmount(num: number | string): string {
  num = Number(num);
  if (num === 0) return '0';

  if (num >= 0.01) {
    return (Math.floor(num * 100) / 100).toFixed(2);
  }

  const str = num.toFixed(20).replace(/\.?0+$/, '');
  const match = str.match(/^0\.0*(\d)/);

  if (!match) return str;

  const zeroCount = match[0].length - 3;
  const firstNonZero = match[1];

  const subscriptZeroCount = String(zeroCount)
    .split('')
    .map((d) => '₀₁₂₃₄₅₆₇₈₉'[+d])
    .join('');

  return `0.0${subscriptZeroCount}${firstNonZero}`;
}
