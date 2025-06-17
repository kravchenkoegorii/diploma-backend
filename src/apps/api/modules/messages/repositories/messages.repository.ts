import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MessageEntity } from '../entities/message.entity';

@Injectable()
export class MessagesRepository extends Repository<MessageEntity> {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super(MessageEntity, dataSource.createEntityManager());
  }
}
