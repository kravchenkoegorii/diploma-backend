import { BaseEntity } from '../../../../../common/entities/base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { SenderType } from '../../../../../common/enums/sender.type.enum';
import { ChatEntity } from 'src/apps/api/modules/chats/entities/chat.entity';

@Entity('messages')
export class MessageEntity extends BaseEntity {
  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'enum', enum: SenderType })
  senderType: SenderType;

  @Column({ type: 'jsonb', nullable: true })
  tool_calls?: Record<string, any>;

  @ManyToOne(() => ChatEntity, (chat) => chat.messages, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  chat?: ChatEntity;
}
