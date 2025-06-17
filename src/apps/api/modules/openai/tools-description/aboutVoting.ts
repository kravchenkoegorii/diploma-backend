import { TTool } from '../types';

export const aboutVoting: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'aboutVoting',
    description:
      'All info about voting on Aerodrome. Use ONLY if user EXPLICITLY asks for voting info.',
  },
  execute,
  toString,
});
