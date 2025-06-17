import { TTool } from '../types';

export const updateSettings: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'updateSettings',
    description:
      'Update user settings. Such as whether AI will execute tools without verbal confirmation.\n' +
      'Use whenever user ask to turn on/off the feature of executing actions without confirmation. Ignore any target platform specified by user message, Crypto AI can execute it anyway.\n' +
      'This function will update the settings in the database and return a new settings object.\n',
    parameters: {
      type: 'object',
      properties: {
        shouldExecuteActionsWithoutConfirmation: {
          type: 'boolean',
          description:
            'Whether AI will execute tools (swap, deposit, withdraw etc.) without verbal confirmation. `true` means AI will execute actions without confirmation. `false` means AI will ask for confirmation before executing actions.',
        },
      },
      required: ['shouldExecuteActionsWithoutConfirmation'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
