export function multiplyWithPrecision(
  a: bigint,
  b: bigint,
  decimals: number,
): bigint {
  return (BigInt(a) * BigInt(b)) / BigInt(10 ** decimals);
}

export function divideWithPrecision(
  numerator: bigint,
  denominator: bigint,
  decimals: number,
): bigint {
  if (denominator === BigInt(0)) return BigInt(0);
  return (numerator * BigInt(100) * BigInt(10 ** decimals)) / denominator;
}
