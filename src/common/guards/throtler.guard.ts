import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  // Override the default tracking logic
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use the user's ID for tracking if authenticated, else use the IP
    return req.user?.id || req.ip;
  }

  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    const req = context.switchToHttp().getRequest();
    if (req.user) {
      return `${req.user.id}:${name}`;
    }

    return `${suffix}:${name}`;
  }
}
