import { TTool } from '../types';

export const aboutTokenLocking: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'aboutTokenLocking',
    description:
      'All info about token locking on Aerodrome. Use ONLY if user EXPLICITLY asks for token locking info.',
  },
  execute,
  toString,
});
