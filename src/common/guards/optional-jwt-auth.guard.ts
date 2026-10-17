import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * For @Public() routes that still want to know who is calling: populates
 * request.user when a valid token is sent, and leaves it null otherwise
 * instead of rejecting the request.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(_err: unknown, user: TUser): TUser | null {
    return user || null;
  }
}
