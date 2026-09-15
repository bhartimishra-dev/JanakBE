import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { CartModule } from '../cart/cart.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthCookieInterceptor } from './interceptors/auth-cookie.interceptor';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        // @nestjs/jwt types expiresIn as `StringValue` (from the `ms` package)
        // rather than a plain string — cast since this is just an env value
        // like '7d' that ms already parses correctly at runtime.
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn') as any },
      }),
    }),
    CartModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, AuthCookieInterceptor],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
