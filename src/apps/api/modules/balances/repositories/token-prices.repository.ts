import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { TokenPriceEntity } from '../entities/token-price.entity';

@Injectable()
export class TokenPricesRepository extends Repository<TokenPriceEntity> {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super(TokenPriceEntity, dataSource.createEntityManager());
  }
}
