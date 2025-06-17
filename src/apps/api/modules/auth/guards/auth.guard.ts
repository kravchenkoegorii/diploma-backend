import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UsersRepository } from 'src/apps/api/modules/users/repositories/users.repository';
import { UsersService } from 'src/apps/api/modules/users/users.service';
import { PRIVY_USER_KEY, USER_METADATA_KEY } from '../constants/keys';
import { PrivyAuthService } from '../services/privy-auth.service';
import { IRequestWithUser, TPrivyAuthParams } from '../types/auth';
import { ApiBearerAuth } from '@nestjs/swagger';

export interface UserMetadata {
  defaultWallet?: string;
  privy_id?: string;
  privyUser?: TPrivyAuthParams;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly usersRepo: UsersRepository,
    private readonly privyAuthService: PrivyAuthService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IRequestWithUser>();
    const isAuthOptional = this.reflector.get<boolean>(
      'isAuthOptional',
      context.getHandler(),
    );

    const isGetPrivyData = this.reflector.get<boolean>(
      'isGetPrivyData',
      context.getHandler(),
    );

    const authToken = this.getAuthorizationToken(request);

    if (!authToken && isAuthOptional) {
      return true;
    }

    if (!authToken) {
      this.logger.error('No auth token provided but required.');
      throw new UnauthorizedException('Authorization token is missing');
    }

    try {
      const params = await this.privyAuthService.validateAuthToken(authToken);

      if (isGetPrivyData) {
        this.storePrivyUserMetadata(context, params);
        return true;
      }

      if (!params || !params.defaultWallet) {
        throw new NotFoundException('The user profile is incomplete');
      }

      const user = await this.validateUser(
        params.privyId,
        params.defaultWallet,
        params.nonDefaultWallets,
      );

      request.user = user;

      this.storeUserMetadata(context, user, params.defaultWallet);
      return true;
    } catch (error) {
      this.logger.error('Privy Auth failed', error);
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new UnauthorizedException(
        'Invalid auth token or error getting user data.',
        error.message,
      );
    }
  }

  private getAuthorizationToken(request: Request): string | null {
    const authorizationHeader = request.headers['authorization'];
    if (!authorizationHeader) {
      return null;
    }
    return authorizationHeader.replace(/^Bearer\s/, '').trim() || null;
  }

  private storePrivyUserMetadata(
    context: ExecutionContext,
    params: TPrivyAuthParams,
  ): void {
    Reflect.defineMetadata(
      PRIVY_USER_KEY,
      { privyUser: params },
      context.getHandler(),
    );
  }

  private storeUserMetadata(
    context: ExecutionContext,
    user: any,
    defaultWallet: string,
  ): void {
    Reflect.defineMetadata(
      USER_METADATA_KEY,
      { ...user, defaultWallet },
      context.getHandler(),
    );
  }

  private async validateUser(
    privyId: string,
    defaultWallet: string,
    nonDefaultWallets: string[],
  ): Promise<any> {
    const user = await this.usersRepo.findOne({
      where: { privy_id: privyId },
      relations: {
        wallets: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        message: 'User does not exist in Database.',
        errorCode: 10001,
      });
    }

    await this.usersService.updateUserWallets(
      defaultWallet,
      nonDefaultWallets,
      user,
    );
    return user;
  }
}

export const UseBearerTokenAuthGuard = () => {
  return applyDecorators(ApiBearerAuth('access-token'), UseGuards(AuthGuard));
};

export const UseOptionalAuthGuard = () => SetMetadata('isAuthOptional', true);

export const GetWalletAddress = createParamDecorator(
  (data: never, ctx: ExecutionContext): string | null => {
    const logger = new Logger(GetWalletAddress.name);
    const reflector = new Reflector();

    const metadata = reflector.get<UserMetadata>(
      USER_METADATA_KEY,
      ctx.getHandler(),
    );
    const defaultWallet = metadata?.defaultWallet;

    // Reflector to get the flag from the context
    const isAuthOptional = reflector.get<boolean>(
      'isAuthOptional',
      ctx.getHandler(),
    );

    if (!defaultWallet && !isAuthOptional) {
      logger.error(
        'Request is authenticated, but wallet address was not found',
      );
      throw new NotFoundException('Wallet address was not found');
    }

    // Return null if auth is optional and defaultWallet is not present
    return defaultWallet || null;
  },
);

export const GetUserPrivyId = createParamDecorator(
  (data: never, ctx: ExecutionContext): string | null => {
    const logger = new Logger(GetUserPrivyId.name);
    const reflector = new Reflector();

    const metadata = reflector.get<UserMetadata>(
      USER_METADATA_KEY,
      ctx.getHandler(),
    );
    const privyId = metadata?.privy_id;

    if (!privyId) {
      logger.error('Request is authenticated, but users not found');
      throw new NotFoundException('User not found');
    }

    return privyId || null;
  },
);
