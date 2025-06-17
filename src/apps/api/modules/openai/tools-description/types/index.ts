export enum LockOperations {
  Extend = 'Extend',
  Merge = 'Merge',
  Increase = 'Increase',
  Withdraw = 'Withdraw',
  SetToRelay = 'SetToRelay',
  ClaimLockRewards = 'ClaimLockRewards',
  Transfer = 'Transfer',
  ResetLock = 'ResetLock',
  Poke = 'Poke',
  Default = 'null',
}

export enum ActionType {
  Stake = 'stake',
  Unstake = 'unstake',
  ClaimFee = 'claimFee',
  ClaimEmission = 'claimEmission',
  ClaimAllRewards = 'claimAllRewards',
  Withdraw = 'withdraw',
  Default = 'null',
}

export enum LockFilters {
  Expired = 'Expired',
  Active = 'Active',
  WithoutVotes = 'WithoutVotes',
  Default = 'null',
}
