import { Injectable, Logger } from '@nestjs/common';
import {
  Chain,
  createPublicClient,
  fallback,
  http,
  PublicClient,
  Transport,
} from 'viem';
import { MAP_CHAIN_ID_CHAIN, VIEM_RPC_URLS } from './constants';

@Injectable()
export class ViemService {
  private readonly logger = new Logger(ViemService.name);
  private clients: Map<number, PublicClient<Transport, Chain>> = new Map();

  getViemClient(chainId: number): PublicClient<Transport, Chain> {
    const existingClient = this.clients.get(chainId);

    if (existingClient) {
      return existingClient;
    }

    const rpcUrls = VIEM_RPC_URLS[chainId];

    if (!rpcUrls) {
      throw new Error(`No RPC URLs configured for chainId ${chainId}`);
    }

    const client: PublicClient<Transport, Chain> = createPublicClient({
      batch: {
        multicall: true,
      },
      chain: MAP_CHAIN_ID_CHAIN[chainId] as Chain,
      transport: fallback(rpcUrls.map((url) => http(url))),
    });

    this.clients.set(chainId, client);
    this.logger.log(`Created Viem client for chainId ${chainId}`);

    return client;
  }
}
