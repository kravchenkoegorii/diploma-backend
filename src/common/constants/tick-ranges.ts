import { RangeConfig } from '../types';

export const TICK_RANGES: RangeConfig[] = [
  {
    title: 'Narrow',
    ranges: {
      1: [1, '0.01%'],
      10: [1, '0.1%'],
      50: [1, '0.5%'],
      100: '3%',
      200: '4%',
      2000: '10%',
    },
  },
  {
    title: 'Common',
    ranges: {
      1: [3, '0.03%'],
      10: [3, '0.3%'],
      50: [3, '1.5%'],
      100: '8%',
      200: '10%',
      2000: '20%',
    },
  },
  {
    title: 'Wide',
    ranges: {
      1: [7, '0.07%'],
      10: [7, '0.7%'],
      50: [7, '3.5%'],
      100: '15%',
      200: '20%',
      2000: '30%',
    },
  },
];
