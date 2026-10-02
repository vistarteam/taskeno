import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesService } from './roles.service';
import { SessionService } from './session.service';

/**
 * Global because `SessionAuthGuard` needs `SessionService` on every route, and
 * most modules need the role helper.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, RolesService],
  exports: [AuthService, SessionService, RolesService],
})
export class AuthModule {}
