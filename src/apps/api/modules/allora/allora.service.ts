import { Injectable, Logger } from '@nestjs/common';
import {
  AlloraAPIClient,
  ChainSlug,
  PriceInferenceTimeframe,
  PriceInferenceToken,
} from '@alloralabs/allora-sdk';
import { BinanceService } from '../binance/binance.service';

@Injectable()
export class AlloraService {
  private readonly logger = new Logger(AlloraService.name);
  private readonly alloraClient: AlloraAPIClient;

  constructor(private readonly binanceService: BinanceService) {
    this.alloraClient = new AlloraAPIClient({
      chainSlug: ChainSlug.MAINNET,
      apiKey: process.env.ALLORA_API_KEY,
    });

    this.fetchPriceInference = this.fetchPriceInference.bind(this);
  }

  async fetchPriceInference(
    token: PriceInferenceToken,
    timeframe: PriceInferenceTimeframe,
    isCompare: boolean,
  ): Promise<{ currentPrice?: string; predictedPrice: string }> {
    try {
      const inference = await this.alloraClient.getPriceInference(
        token,
        timeframe,
      );

      const predictedPrice =
        inference?.inference_data?.network_inference_normalized;

      this.logger.log(
        `Price inference data for ${token} and timeframe ${timeframe}: ${predictedPrice}`,
      );

      if (isCompare) {
        const currentPrice = await this.binanceService.getRateForOneCurrency(
          token.toString(),
          true,
        );

        return { currentPrice: currentPrice?.toString(), predictedPrice };
      }

      return { predictedPrice };
    } catch (error) {
      this.logger.error(`Error fetching price inference: ${error}`);
      throw error;
    }
  }
}
