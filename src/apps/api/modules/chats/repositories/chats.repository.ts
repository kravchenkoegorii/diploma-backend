import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ChatEntity } from '../entities/chat.entity';

@Injectable()
export class ChatsRepository extends Repository<ChatEntity> {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super(ChatEntity, dataSource.createEntityManager());
  }
}
