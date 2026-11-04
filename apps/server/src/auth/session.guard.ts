import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SessionClaims, SessionService } from './session.service';

export interface AuthedRequest extends Request {
  session: SessionClaims;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu mã truy cập');
    }
    request.session = this.sessions.verify(header.slice('Bearer '.length).trim());
    return true;
  }
}
