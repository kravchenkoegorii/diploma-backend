import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserEntity } from 'src/apps/api/modules/users/entities/user.entity';
import { IRequestWithUser } from '../types/auth';

export const GetUserByPrivyAuth = createParamDecorator(
  (_: never, ctx: ExecutionContext): UserEntity | void => {
    const request = ctx.switchToHttp().getRequest<IRequestWithUser>();

    return request.user;
  },
);
