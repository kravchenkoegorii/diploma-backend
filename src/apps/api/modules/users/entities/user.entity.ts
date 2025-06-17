import { Column, Entity, OneToMany } from 'typeorm';
import { WalletEntity } from './wallet.entity';
import { BaseEntity } from 'src/common/entities/base.entity';
import { ChatEntity } from '../../chats/entities/chat.entity';

@Entity('users')
export class UserEntity extends BaseEntity {
  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true, unique: true })
  privy_id?: string;

  @OneToMany(() => WalletEntity, (wallet) => wallet.user, { cascade: true })
  wallets: WalletEntity[];

  @OneToMany(() => ChatEntity, (chat) => chat.user, { cascade: true })
  chats: ChatEntity[];

  @Column({ type: 'boolean', default: true })
  should_execute_actions_without_confirmation: boolean;
}
