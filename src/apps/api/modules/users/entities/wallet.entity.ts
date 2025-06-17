import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { UserEntity } from './user.entity';
import { BaseEntity } from '../../../../../common/entities/base.entity';
import { WalletBalanceEntity } from '../../balances/entities/wallet-balance.entity';

@Entity('wallets')
export class WalletEntity extends BaseEntity {
  @Column({ unique: true })
  address: string;

  @Column({ default: false })
  isDefault: boolean;

  @ManyToOne(() => UserEntity, (user) => user.wallets, {
    onDelete: 'CASCADE',
  })
  user: UserEntity;

  @OneToMany(() => WalletBalanceEntity, (walletBalance) => walletBalance.wallet)
  balances: WalletBalanceEntity[];
}
