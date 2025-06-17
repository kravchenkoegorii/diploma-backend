export interface DexScreenerTokenInfo {
  schemaVersion: string;
  pairs: [
    {
      chainId: string;
      dexId: string;
      url: string;
      pairAddress: string;
      labels: string[];
      baseToken: {
        address: string;
        name: string;
        symbol: string;
      };
      quoteToken: {
        address: string;
        name: string;
        symbol: string;
      };
      priceNative: string;
      priceUsd: string;
      liquidity: {
        usd: 0;
        base: 0;
        quote: 0;
      };
      fdv: 0;
      marketCap: 0;
      info: {
        imageUrl: string;
        websites: [
          {
            url: string;
          },
        ];
        socials: [
          {
            platform: string;
            handle: string;
          },
        ];
      };
      priceChange?: { m5: number; h1: number; h6: number; h24: number };
      volume: {
        h24: number;
        h6: number;
        h1: number;
        m5: number;
      };
    },
  ];
}
