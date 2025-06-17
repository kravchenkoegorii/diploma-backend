import { HttpException } from '@nestjs/common';

export abstract class AppHttpException extends HttpException {
  protected constructor(
    status: number,
    code: string,
    message: string,
    data?: Record<string, unknown>,
  ) {
    super(
      {
        code,
        message,
        data,
      },
      status,
    );
  }
}
