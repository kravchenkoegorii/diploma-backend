import { Module } from '@nestjs/common';
import { AlloraService } from './allora.service';
import { BinanceService } from '../binance/binance.service';

@Module({
  providers: [AlloraService, BinanceService],
  exports: [AlloraService],
})
export class AlloraModule {}
