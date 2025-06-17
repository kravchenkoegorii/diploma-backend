import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrivyClient } from '@privy-io/server-auth';
import { ConfigService } from '@nestjs/config';
import { TPrivyAuthParams } from '../types/auth';
import { IPrivyAuthConfig } from 'src/common/configs/privy-auth.config';

@Injectable()
export class PrivyAuthService {
  private readonly client: PrivyClient;
  private readonly privyAuthConfig: IPrivyAuthConfig;

  constructor(private readonly configService: ConfigService) {
    this.privyAuthConfig =
      this.configService.getOrThrow<IPrivyAuthConfig>('privy_auth');

    this.client = new PrivyClient(
      this.privyAuthConfig.appId,
      this.privyAuthConfig.appSecret,
    );
  }

  async validateAuthToken(authToken: string): Promise<TPrivyAuthParams> {
    try {
      const verifyPrivyUser = await this.client.verifyAuthToken(authToken);

      const user = await this.client.getUser(verifyPrivyUser.userId);

      const linkedWallets = user.linkedAccounts.filter(
        (account) => account.type === 'wallet',
      );

      const defaultWallet = linkedWallets[0];

      const defaultWalletAddress = (defaultWallet as { address: string })
        ?.address;

      const nonDefaultWallets = user.linkedAccounts
        .filter(
          (account) =>
            account.type === 'wallet' &&
            'address' in account &&
            account.address !== defaultWalletAddress,
        )
        .map((account) => (account as { address: string }).address);

      return {
        email: user.email?.address || undefined,
        phone: user.phone?.number || undefined,
        defaultWallet: defaultWalletAddress,
        nonDefaultWallets,
        privyId: user.id,
      };
    } catch (error) {
      throw new UnauthorizedException(
        'Invalid auth token or error getting user data.',
        error.message,
      );
    }
  }
}
