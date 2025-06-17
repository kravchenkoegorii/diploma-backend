import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../../common/entities/base.entity';
import { WalletEntity } from '../../users/entities/wallet.entity';

@Entity('wallet_balances')
@Index(['wallet_id', 'block_number', 'chain_id'], { unique: true })
export class WalletBalanceEntity extends BaseEntity {
  @Column()
  wallet_id: string;

  @ManyToOne(() => WalletEntity, (wallet) => wallet.balances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'wallet_id' })
  wallet: WalletEntity;

  @Column({ type: 'varchar' })
  balance: string;

  @Column({ type: 'bigint' })
  block_number: string;

  @Column({ type: 'integer' })
  chain_id: number;
}
