import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './repositories/users.repository';
import { WalletsRepository } from './repositories/wallets-repository.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersRepository, WalletsRepository, UsersService],
  exports: [UsersRepository, WalletsRepository, UsersService],
})
export class UsersModule {}
