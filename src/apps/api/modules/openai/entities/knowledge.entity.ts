import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'knowledge' })
export class KnowledgeEntity extends BaseEntity {
  @Column({ type: 'varchar', unique: true })
  key: string;

  @Column({ type: 'varchar' })
  value: string;
}
