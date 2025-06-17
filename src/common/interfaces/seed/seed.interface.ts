import { IAbstractRepository } from 'src/common/base-classes';
import { ObjectLiteral, QueryRunner } from 'typeorm';

export abstract class AbstractSeed<T extends ObjectLiteral> {
  constructor(
    private readonly _repository: IAbstractRepository<T>,
    private readonly _testData: T[],
    private readonly _mainData: T[],
  ) {}

  async plantTest(qr: QueryRunner): Promise<void> {
    await this.fill(qr, this._testData);
  }

  async plantMain(qr: QueryRunner): Promise<void> {
    await this.fill(qr, this._mainData);
  }

  private async fill(qr: QueryRunner, data: T[]): Promise<void> {
    await this._repository.saveMany(data, qr);
  }
}
