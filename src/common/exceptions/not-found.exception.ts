import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from './app-http.exception';

export class NotFoundException extends AppHttpException {
  constructor(message: string, error?: any) {
    super(
      error?.status || error?.response?.status || HttpStatus.NOT_FOUND,
      NotFoundException.name,
      error?.detail || error?.message || message,
    );
  }
}
