import { BaseEntity } from '../../../../../common/entities/base.entity';
import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { MessageEntity } from 'src/apps/api/modules/messages/entities/message.entity';

@Entity('chats')
export class ChatEntity extends BaseEntity {
  @Column()
  title: string;

  @OneToMany(() => MessageEntity, (message) => message.chat, { cascade: true })
  messages: MessageEntity[];

  @ManyToOne(() => UserEntity, (user) => user.chats, {
    onDelete: 'CASCADE',
  })
  user: UserEntity;
}
