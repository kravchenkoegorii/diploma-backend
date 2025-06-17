export function floorToFixed(value: number, decimals = 5): string {
  const factor = Math.pow(10, decimals);
  return String(Math.floor(value * factor) / factor);
}
