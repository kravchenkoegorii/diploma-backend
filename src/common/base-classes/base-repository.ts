import {
  DataSource,
  DeepPartial,
  EntityTarget,
  FindOptionsRelations,
  FindOptionsWhere,
  ObjectLiteral,
  QueryRunner,
  Repository,
} from 'typeorm';

import { DatabaseException, NotFoundException } from 'src/common/exceptions';

export interface IAbstractRepository<Entity extends ObjectLiteral> {
  getByParams({
    where,
    limit,
    throwError,
    relations,
    qr,
  }: {
    where?: FindOptionsWhere<Entity>;
    limit?: number;
    throwError?: boolean;
    relations?: FindOptionsRelations<Entity>;
    qr?: QueryRunner;
  }): Promise<Entity[]>;

  getOneByParams({
    where,
    throwError,
    relations,
    qr,
  }: {
    where: FindOptionsWhere<Entity>;
    throwError?: boolean;
    relations?: FindOptionsRelations<Entity>;
    qr?: QueryRunner;
  }): Promise<Entity>;

  save(data: DeepPartial<Entity>, qr?: QueryRunner): Promise<Entity>;

  saveMany(data: DeepPartial<Entity>[], qr?: QueryRunner): Promise<Entity[]>;

  getRepository(qr?: QueryRunner): Repository<Entity>;
}

export function BaseRepository<Entity extends ObjectLiteral>(
  ref: EntityTarget<Entity>,
): {
  new (dataSource: DataSource): IAbstractRepository<Entity>;
} {
  abstract class AbstractRepository implements IAbstractRepository<Entity> {
    constructor(protected readonly dataSource: DataSource) {}

    async getByParams(
      {
        where,
        limit,
        throwError = true,
        relations,
        qr,
      }: {
        where?: FindOptionsWhere<Entity>;
        limit?: number;
        throwError?: boolean;
        relations?: FindOptionsRelations<Entity>;
        qr?: QueryRunner;
      } = { throwError: true },
    ): Promise<Entity[]> {
      try {
        const repo = this.getRepository(qr);
        const data = await repo.find({
          where: where,
          take: limit,
          relations,
        });

        if (throwError && (!data || !data?.length)) {
          throw new NotFoundException('Data not found!', where);
        }

        return data;
      } catch (error) {
        throw new DatabaseException(error.message, error);
      }
    }

    async getOneByParams({
      where,
      throwError = true,
      relations,
      qr,
    }: {
      where: FindOptionsWhere<Entity>;
      throwError?: boolean;
      relations?: FindOptionsRelations<Entity>;
      qr?: QueryRunner;
    }): Promise<Entity> {
      const data = await this.getByParams({
        where,
        limit: 1,
        throwError,
        relations,
        qr,
      });
      return data[0];
    }

    async save(data: DeepPartial<Entity>, qr?: QueryRunner): Promise<Entity> {
      try {
        const repo = this.getRepository(qr);

        return await repo.save(data, { reload: true });
      } catch (error) {
        throw new DatabaseException(error.message, error);
      }
    }

    async saveMany(
      data: DeepPartial<Entity>[],
      qr?: QueryRunner,
    ): Promise<Entity[]> {
      try {
        const repo = this.getRepository(qr);

        return await repo.save(data);
      } catch (error) {
        throw new DatabaseException(error.message, error);
      }
    }

    getRepository(qr?: QueryRunner) {
      if (qr) {
        return qr.manager.getRepository(ref);
      }
      return this.dataSource.getRepository(ref);
    }
  }

  return AbstractRepository as any;
}
