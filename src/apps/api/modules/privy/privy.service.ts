import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrivyClient } from '@privy-io/server-auth';
import { Address, Chain, encodeFunctionData, PublicClient } from 'viem';
import { simulateContract, waitForTransactionReceipt } from 'viem/actions';
import { IPrivyAuthConfig } from '../../../../common/configs/privy-auth.config';

@Injectable()
export class PrivyService {
  readonly client: PrivyClient;
  private readonly privyAuthConfig: IPrivyAuthConfig;

  private readonly logger = new Logger(PrivyService.name);

  constructor(private readonly configService: ConfigService) {
    this.privyAuthConfig =
      this.configService.getOrThrow<IPrivyAuthConfig>('privy_auth');

    this.client = new PrivyClient(
      this.privyAuthConfig.appId,
      this.privyAuthConfig.appSecret,
      {
        walletApi: {
          authorizationPrivateKey: process.env.PRIVY_WALLET_API_KEY,
        },
      },
    );
  }

  async sendTransaction(
    {
      viemClient,
      address,
      abi,
      functionName,
      args,
      chain,
      value,
      account,
      gasLimit,
    }: {
      viemClient: PublicClient;
      address: Address;
      abi: readonly any[];
      functionName: string;
      args: any[] | undefined;
      chain: Chain;
      value: bigint | undefined;
      account: Address;
      gasLimit?: number;
    },
    isWaitForTx = true,
  ): Promise<string> {
    const { request } = await simulateContract(viemClient, {
      address,
      abi,
      functionName,
      args: args ?? [],
      chain,
      value,
      account,
    });

    const encodedTxData = encodeFunctionData({
      ...request,
      args: args ?? [],
    });

    const { hash } = await this.client.walletApi.ethereum.sendTransaction({
      address: account,
      chainType: 'ethereum',
      caip2: `eip155:${chain.id}`,
      transaction: {
        value: value ? Number(value) : undefined,
        chainId: chain.id,
        to: address,
        data: encodedTxData,
        gasLimit: gasLimit ? gasLimit : undefined,
      },
    });

    if (!hash) {
      throw new Error('Invalid transaction');
    }

    if (!isWaitForTx) {
      return hash;
    }

    await waitForTransactionReceipt(viemClient, { hash: hash as Address });

    return hash;
  }

  async approve({
    viemClient,
    address,
    abi,
    functionName,
    args,
    chain,
    account,
  }: {
    viemClient: PublicClient;
    address: Address;
    abi: readonly any[];
    functionName: string;
    args: any[];
    chain: Chain;
    account: Address;
  }) {
    const encodedData = encodeFunctionData({
      abi,
      functionName,
      args,
    });

    const { hash } = await this.client.walletApi.ethereum.sendTransaction({
      address: account,
      chainType: 'ethereum',
      caip2: `eip155:${chain.id}`,
      transaction: {
        chainId: chain.id,
        to: address,
        data: encodedData,
      },
    });

    this.logger.log(`Approval ${hash} by ${account}`);

    await waitForTransactionReceipt(viemClient, {
      hash: hash as Address,
    });
  }
}
