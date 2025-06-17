import { Injectable, OnModuleInit } from '@nestjs/common';
import { coingeckoTokens } from 'src/common/constants/coingecko-tokens';

interface Token {
  id: string;
  symbol: string;
  name: string;
}

@Injectable()
export class CoingeckoTokenIdService implements OnModuleInit {
  private tokens: Map<string, string> = new Map();

  async onModuleInit() {
    const tokenArray: Token[] = coingeckoTokens as Token[];
    this.tokens = new Map(
      tokenArray.map((token) => [token.symbol.toLowerCase(), token.id]),
    );
  }

  getTokenKey(symbol: string): string | undefined {
    return this.tokens.get(symbol.toLowerCase());
  }
}
