import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { WalletEntity } from '../entities/wallet.entity';

@Injectable()
export class WalletsRepository extends Repository<WalletEntity> {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super(WalletEntity, dataSource.createEntityManager());
  }
}
