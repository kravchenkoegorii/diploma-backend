import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetAuthorizationHeader = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest();

    const header = req.headers['authorization'];

    return header?.replace(/^Bearer /, '');
  },
);
