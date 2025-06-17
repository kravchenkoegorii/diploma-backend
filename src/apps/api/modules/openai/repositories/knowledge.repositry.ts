import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { KnowledgeEntity } from '../entities/knowledge.entity';

@Injectable()
export class KnowledgeRepository extends Repository<KnowledgeEntity> {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super(KnowledgeEntity, dataSource.createEntityManager());
  }
}
