import { forwardRef, Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { PrivyAuthService } from './services/privy-auth.service';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { privyAuthConfig } from 'src/common/configs/privy-auth.config';
import { AuthService } from './auth.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [privyAuthConfig],
    }),
    forwardRef(() => UsersModule),
  ],
  controllers: [AuthController],
  providers: [PrivyAuthService, AuthService],
  exports: [PrivyAuthService, AuthService],
})
export class AuthModule {}
