import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../../common/entities/base.entity';
import { Address } from 'viem';

@Entity('token_prices')
@Index(['address', 'block_number', 'chain_id'], { unique: true })
export class TokenPriceEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  address: Address;

  @Column({ type: 'varchar' })
  price: string;

  @Column({ type: 'bigint' })
  block_number: string;

  @Column({ type: 'integer' })
  chain_id: number;
}
