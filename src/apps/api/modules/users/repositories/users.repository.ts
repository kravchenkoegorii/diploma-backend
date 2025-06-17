import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { UserEntity } from '../entities/user.entity';

@Injectable()
export class UsersRepository extends Repository<UserEntity> {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super(UserEntity, dataSource.createEntityManager());
  }
}
