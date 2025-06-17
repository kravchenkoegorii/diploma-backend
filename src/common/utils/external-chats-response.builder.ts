import { ToolNameEnum } from '../enums/tool.enum';

export const actionTypeHandlers: Record<
  ToolNameEnum,
  (hash: { success: boolean; [x: string]: any }, link: string) => string
> = {
  [ToolNameEnum.SWAP]: (tx, link) =>
    `Your swap request was successfully proceeded: ${link}.`,
  [ToolNameEnum.POKE_LOCK]: (tx, link) =>
    `Your poke lock request was successfully proceeded: ${link}.`,
  [ToolNameEnum.ADD_LIQUIDITY]: (tx, link) =>
    `Liquidity successfully added to the pool: ${link}.`,
  [ToolNameEnum.WITHDRAW]: (tx, link) =>
    `Withdrawal request was successfully proceeded: ${link}.`,
  [ToolNameEnum.STAKE]: (tx, link) =>
    `Staking request was successfully proceeded: ${link}.`,
  [ToolNameEnum.UNSTAKE]: (tx, link) =>
    `Unstaking request was successfully proceeded: ${link}.`,
  [ToolNameEnum.CLAIM_FEE]: (tx, link) =>
    tx.success
      ? `Claim fee rewards ${
          tx.poolSymbol ? `for ${tx.poolSymbol}` : ''
        } request was successfully proceeded: ${link}.`
      : `Claiming fee rewards ${
          tx.poolSymbol ? `for ${tx.poolSymbol}` : ''
        } fails.`,
  [ToolNameEnum.CLAIM_EMISSION]: (tx, link) =>
    tx.success
      ? `Claim emission rewards ${
          tx.poolSymbol ? `for ${tx.poolSymbol}` : ''
        } request was successfully proceeded: ${link}.`
      : `Claiming emission rewards ${
          tx.poolSymbol ? `for ${tx.poolSymbol}` : ''
        } fails.`,
  [ToolNameEnum.CLAIM_ALL_REWARDS]: (tx, link) =>
    tx.success
      ? `Claim ${tx.action === 'claimEmission' ? 'emission' : 'fee'} rewards ${
          tx.poolSymbol ? `for ${tx.poolSymbol}` : ''
        } request was successfully proceeded: ${link}.`
      : `Claiming ${
          tx.action === 'claimEmission' ? 'emission' : 'fee'
        } rewards ${tx.poolSymbol ? `for ${tx.poolSymbol}` : ''} fails.`,
  [ToolNameEnum.LOCK_TOKENS]: (tx, link) =>
    `Lock tokens request was successfully proceeded: ${link}.`,
  [ToolNameEnum.VOTE]: (tx, link) =>
    `Vote request was successfully proceeded: ${link}.`,
  [ToolNameEnum.SET_LOCK_TO_RELAY]: (tx, link) =>
    `Setting lock to relay request was successfully proceeded: ${link}.`,
  [ToolNameEnum.EXTEND_LOCK]: (tx, link) =>
    `Extend lock duration request was successfully proceeded: ${link}.`,
  [ToolNameEnum.INCREASE_LOCK]: (tx, link) =>
    `Increase lock request was successfully proceeded: ${link}.`,
  [ToolNameEnum.MERGE_LOCKS]: (tx, link) =>
    `Merge locks request was successfully proceeded: ${link}.`,
  [ToolNameEnum.TRANSFER_LOCK]: (tx, link) =>
    `Transfer lock request was successfully proceeded: ${link}.`,
  [ToolNameEnum.WITHDRAW_LOCK]: (tx, link) =>
    `Lock withdrawal request was successfully proceeded: ${link}.`,
  [ToolNameEnum.CLAIM_LOCK_REWARDS]: (tx, link) =>
    tx.success
      ? `Claim lock rewards ${
          tx.lockIds ? `for Lock(s) ${tx.lockIds.join(', ')}` : ''
        } request was successfully proceeded: ${link}.`
      : `Claiming lock rewards ${
          tx.lockId ? `for Lock #${tx.lockId}` : ''
        } fails.`,
  [ToolNameEnum.RESET_LOCK]: (tx, link) =>
    tx.success
      ? `Reset lock ${tx.lockId} request was successfully proceeded: ${link}.`
      : `Resetting lock with ID ${tx.lockId} fails.`,
  [ToolNameEnum.ClAIM_VOTE_REWARDS]: (transaction, link) => {
    if (transaction.success) {
      return `Claim lock rewards ${
        transaction.lockId ? `for Lock #${transaction.lockId}` : ''
      } request was successfully proceeded: ${link}\n`;
    } else {
      return `Claiming lock rewards ${
        transaction.lockId ? `for Lock #${transaction.lockId}` : ''
      } fails `;
    }
  },
};
