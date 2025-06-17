export type TBooleanString = 'true' | 'false';

export const booleanStringToBoolean = (value: TBooleanString) =>
  value === 'true';
