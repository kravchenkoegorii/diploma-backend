import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

export const runWithQueryRunner = async <T>(
  dataSource: DataSource,
  query: (qr: QueryRunner) => T | Promise<T>,
) => {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const result = await query(queryRunner);

    await queryRunner.commitTransaction();
    return result;
  } catch (error) {
    console.error(error);
    await queryRunner.rollbackTransaction();
    if (error instanceof BadRequestException) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof UnauthorizedException) {
      throw new UnauthorizedException(error.message);
    }
    throw new InternalServerErrorException();
  } finally {
    await queryRunner.release();
  }
};
