import { Request } from 'express';
import { UserEntity } from 'src/apps/api/modules/users/entities/user.entity';

export type TPrivyAuthParams = {
  email?: string;
  phone?: string;
  defaultWallet: string;
  nonDefaultWallets: string[];
  privyId: string;
};

export interface IRequestWithUser extends Request {
  user: UserEntity;
}
