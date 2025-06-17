import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { WalletBalanceEntity } from '../entities/wallet-balance.entity';

@Injectable()
export class WalletBalancesRepository extends Repository<WalletBalanceEntity> {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super(WalletBalanceEntity, dataSource.createEntityManager());
  }
}
