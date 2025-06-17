import { encodeAbiParameters, Hex, parseAbiParameters } from 'viem';

export class UniversalRouterBuilder {
  static SwapCommand = Object.freeze({
    V3_SWAP_EXACT_IN: 0, // Swap exact input amount using Uniswap V3-style pools.
    V3_SWAP_EXACT_OUT: 1, // Swap to achieve an exact output using Uniswap V3-style pools.
    PERMIT2_TRANSFER_FROM: 2, // Transfer tokens using permit2.
    SWEEP: 4, // Sweep tokens to a specific address.
    TRANSFER: 5, // Transfer tokens to a specific address.
    V2_SWAP_EXACT_IN: 8, // Swap exact input amount using Uniswap V2-style pools.
    V2_SWAP_EXACT_OUT: 9, // Swap to achieve an exact output using Uniswap V2-style pools.
    WRAP_ETH: 11, // Wrap native ETH into WETH.
    UNWRAP_WETH: 12, // Unwrap WETH back into native ETH.
    APPROVE_ERC20: 34, // Approve an ERC20 token for a specific spender.
  });
  static SwapCommandsAbi = {
    0: parseAbiParameters('address, uint256, uint256, bytes, bool'),
    1: parseAbiParameters('address, uint256, uint256, bytes, bool'),
    2: parseAbiParameters('address, address, uint160'),
    4: parseAbiParameters('address, address, uint256'),
    5: parseAbiParameters('address, address, uint256'),
    8: parseAbiParameters(
      'address, uint256, uint256, (address from, address to, bool stable)[], bool',
    ),
    9: parseAbiParameters(
      'address, uint256, uint256, (address from, address to, bool stable)[], bool',
    ),
    11: parseAbiParameters('address, uint256'),
    12: parseAbiParameters('address, uint256'),
    34: parseAbiParameters('address, address'),
  };
  commands: Hex;
  inputs: Hex[];

  constructor() {
    this.commands = '0x'; // Hexadecimal string representing the sequence of commands.
    this.inputs = []; // Array to store encoded input parameters for each command.
    this.addCommand.bind(this);
  }

  /**
   * Adds a new command to the route planner.
   * @param {number} commandCode - The numeric code representing the command type.
   * @param {Array} parameters - The parameters associated with the command.
   */
  addCommand(commandCode: number, parameters: Array<any>) {
    // Encode the parameters using a helper function (zb).
    const encodedParams = encodeAbiParameters(
      UniversalRouterBuilder.SwapCommandsAbi[commandCode],
      parameters,
    );

    // Store the encoded parameters.
    this.inputs.push(encodedParams);

    // Append the hexadecimal representation of the command code to the commands string.
    this.commands += commandCode.toString(16).padStart(2, '0');
  }
}
