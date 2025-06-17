import { Ranges } from '../types';

export const calculateTicks = (
  tick: number,
  spacing: number,
  ranges: Ranges,
): [number, number] => {
  const rangeValue = ranges[spacing];
  if (!rangeValue) {
    throw new Error(`No range defined for spacing ${spacing}`);
  }

  if (typeof rangeValue === 'string') {
    const percent = Number(rangeValue.slice(0, -1)) / 100;
    const tickLower =
      Math.round((tick + Math.log(1 - percent) / 1e-4) / spacing) * spacing;
    const tickUpper =
      Math.round((tick + Math.log(1 + percent) / 1e-4) / spacing) * spacing;
    return [tickLower, tickUpper];
  } else {
    const tickRounded = Math.round(tick / spacing) * spacing;
    const E = rangeValue[0];
    const tickLower = tickRounded - E * spacing;
    const tickUpper = tickRounded + (1 + E) * spacing;
    return [tickLower, tickUpper];
  }
};
