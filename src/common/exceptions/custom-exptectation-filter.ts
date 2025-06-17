import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { CustomException } from './custom.exception';

@Catch(CustomException)
export class CustomExceptionFilter implements ExceptionFilter {
  catch(exception: CustomException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: exception.message,
      error: 'Bad request',
      timestamp: new Date().toISOString(),
    });
  }
}
