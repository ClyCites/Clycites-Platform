import { HttpException, HttpStatus } from '@nestjs/common';

export class LoginLockedOutException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super({ message: 'Too many login attempts' }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
