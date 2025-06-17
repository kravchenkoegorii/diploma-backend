import { Module } from '@nestjs/common';
import { BalancesService } from './balances.service';
import { BalancesController } from './balances.controller';
import { TokenPricesRepository } from './repositories/token-prices.repository';
import { WalletBalancesRepository } from './repositories/wallet-balances.repository';
import { WalletsRepository } from '../users/repositories/wallets-repository.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { ViemModule } from '../viem/viem.module';

@Module({
  imports: [UsersModule, AuthModule, ViemModule],
  controllers: [BalancesController],
  providers: [
    TokenPricesRepository,
    WalletBalancesRepository,
    WalletsRepository,
    BalancesService,
  ],
  exports: [TokenPricesRepository, WalletBalancesRepository],
})
export class BalancesModule {}
