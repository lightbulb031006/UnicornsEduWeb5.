import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ActionHistoryModule } from '../action-history/action-history.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthIdentityCacheService } from './auth-identity-cache.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { MailModule } from '../mail/mail.module';
import { GoogleStrategy } from './strategies/google-oauth.strategy';
import { AuthAccessService } from './auth-access.service';
import { GoogleAuthExceptionFilter } from './filters/google-auth.exception-filter';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [
    ActionHistoryModule,
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthAccessService,
    AuthIdentityCacheService,
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleStrategy,
    GoogleAuthExceptionFilter,
    ApiKeyGuard,
  ],
  exports: [
    AuthService,
    AuthAccessService,
    AuthIdentityCacheService,
    ApiKeyGuard,
  ],
})
export class AuthModule {}
