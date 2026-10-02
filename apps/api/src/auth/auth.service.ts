import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import type { Prisma } from '../../generated/client';
import { UserRole } from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import { AuthIdentityCacheService } from './auth-identity-cache.service';
import { AuthAccessService } from './auth-access.service';
import { CreateUserDto } from '../dtos/user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  resolvePublicFrontendUrl,
  type PublicRequestOrigin,
} from '../mail/public-frontend-url';
import { AuthProfileDto, LoginResponseDto } from 'src/dtos/auth.dto';
import type { RequestWithResolvedAuthContext } from './auth-request-context';
import { createSignedStorageUrl } from 'src/storage/supabase-storage';
import { STAFF_DATA_CONSENT_VERSION } from './constants';
import { UserDeviceService } from './user-device.service';
import type { DeviceInfo } from './user-device.service';

type JwtSignOptions = Parameters<JwtService['signAsync']>[1];
type UserAuditClient = Prisma.TransactionClient | PrismaService;
const AVATAR_STORAGE_BUCKET = 'avatars';
const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
export { STAFF_DATA_CONSENT_VERSION } from './constants';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface EmailVerifyPayload {
  email: string;
  purpose: 'email-verify' | 'forgot-password';
  passwordResetVersion?: string;
}

interface ProvisionUserOptions {
  auditActor?: ActionHistoryActor;
  createDescription?: string;
  updateDescription?: string;
  successMessage?: string;
  emailVerified?: boolean;
  emailLinkOrigin?: PublicRequestOrigin;
}

type ProvisionUserInput = Pick<
  CreateUserDto,
  'email' | 'password' | 'accountHandle'
> &
  Partial<
    Pick<CreateUserDto, 'phone' | 'province' | 'first_name' | 'last_name'>
  >;

@Injectable()
export class AuthService {
  readonly accessTokenOptions: JwtSignOptions;
  readonly emailVerifyTokenOptions: JwtSignOptions;
  readonly forgotPasswordTokenOptions: JwtSignOptions;
  readonly emailVerifySecret: string;
  readonly forgotPasswordSecret: string;
  readonly refreshTokenSecret: string;
  readonly accessTokenExpiresIn = 60 * 15;
  readonly refreshTokenDefaultExpiresIn = 60 * 60 * 24;
  readonly refreshTokenRememberExpiresIn = 60 * 60 * 24 * 30;
  readonly forgotPasswordTokenExpiresIn = 60 * 60 * 24 * 7;
  readonly verifyTokenExpiresIn = 60 * 60 * 24;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly authIdentityCacheService: AuthIdentityCacheService,
    private readonly authAccessService: AuthAccessService,
    private readonly userDeviceService: UserDeviceService,
  ) {
    this.accessTokenOptions = {
      expiresIn: this.accessTokenExpiresIn,
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    };
    this.emailVerifyTokenOptions = {
      expiresIn: this.verifyTokenExpiresIn,
      secret: this.configService.getOrThrow<string>('JWT_EMAIL_VERIFY_SECRET'),
    };
    this.forgotPasswordSecret = this.configService.getOrThrow<string>(
      'JWT_FORGOT_PASSWORD_SECRET',
    );
    this.refreshTokenSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.forgotPasswordTokenOptions = {
      expiresIn: this.forgotPasswordTokenExpiresIn,
      secret: this.forgotPasswordSecret,
    };
    this.emailVerifySecret = this.configService.getOrThrow<string>(
      'JWT_EMAIL_VERIFY_SECRET',
    );
  }

  private getUserAuditSnapshot(db: UserAuditClient, userId: string) {
    return db.user.findUnique({
      where: { id: userId },
      include: {
        staffInfo: true,
        studentInfo: true,
      },
    });
  }

  private buildUserActor(user: {
    id: string;
    email: string;
    roleType: UserRole;
  }): ActionHistoryActor {
    return {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    };
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private async createAvatarSignedUrl(path?: string | null) {
    return createSignedStorageUrl({
      bucket: AVATAR_STORAGE_BUCKET,
      path,
      expiresIn: AVATAR_SIGNED_URL_TTL_SECONDS,
    });
  }

  private async findExistingUserForProvisioning(data: ProvisionUserInput) {
    const [existingHandleUser, existingEmailUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { accountHandle: data.accountHandle },
        select: {
          id: true,
          email: true,
          accountHandle: true,
          emailVerified: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { email: data.email },
        select: {
          id: true,
          email: true,
          accountHandle: true,
          emailVerified: true,
        },
      }),
    ]);

    if (
      existingHandleUser &&
      (existingHandleUser.email !== data.email ||
        existingHandleUser.emailVerified)
    ) {
      throw new BadRequestException('Handle already exists');
    }

    if (existingEmailUser?.emailVerified) {
      throw new BadRequestException('Email already exists');
    }

    return existingEmailUser ?? existingHandleUser ?? null;
  }

  async login(
    accountHandle: string,
    password: string,
    rememberMe = false,
  ): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ accountHandle: accountHandle }, { email: accountHandle }],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      roleType: user.roleType,
      accountHandle: user.accountHandle,
      id: user.id,
      avatarUrl: await this.createAvatarSignedUrl(user.avatarPath),
      tokenPair: await this.issueTokenPairForUser(
        user.id,
        user.accountHandle,
        user.roleType,
        rememberMe,
      ),
    };
  }

  async refreshTokens(
    userId: string,
    _usedRefreshToken: string,
    rememberMe = false,
    deviceId: string,
  ): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountHandle: true,
        roleType: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateTokenPairAndSave(
      user.id,
      user.accountHandle,
      user.roleType,
      rememberMe,
      deviceId,
    );
  }

  async getAuthProfile(
    userId: string,
    request?: RequestWithResolvedAuthContext,
  ): Promise<AuthProfileDto | null> {
    const user = await this.authIdentityCacheService.getAuthIdentity(
      userId,
      request,
    );

    if (!user) {
      return null;
    }

    const [avatarUrl, authAccess] = await Promise.all([
      this.createAvatarSignedUrl(user.avatarPath),
      this.authAccessService.resolveForIdentity(user, request),
    ]);
    const dataConsentAcceptedAt = user.dataProcessingConsentAcceptedAt ?? null;
    const dataConsentVersion = user.dataProcessingConsentVersion ?? null;
    const requiresStaffDataConsent =
      authAccess.hasStaffProfile &&
      Boolean(user.emailVerified) &&
      (dataConsentAcceptedAt === null ||
        dataConsentVersion !== STAFF_DATA_CONSENT_VERSION);

    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      dataConsentAcceptedAt,
      dataConsentVersion,
      requiresStaffDataConsent,
      canAccessRestrictedRoutes:
        authAccess.access.admin.tier === 'full' || Boolean(user.emailVerified),
      accountHandle: user.accountHandle,
      roleType: user.roleType,
      requiresPasswordSetup: user.requiresPasswordSetup,
      avatarUrl,
      staffRoles: authAccess.staffRoles,
      hasStaffProfile: authAccess.hasStaffProfile,
      hasStudentProfile: authAccess.hasStudentProfile,
      effectiveRoleTypes: authAccess.effectiveRoleTypes,
      staffProfileComplete: authAccess.staffProfileComplete,
      availableWorkspaces: authAccess.availableWorkspaces,
      defaultWorkspace: authAccess.defaultWorkspace,
      preferredRedirect: authAccess.preferredRedirect,
      access: authAccess.access,
    };
  }

  async acceptDataConsent(userId: string): Promise<{
    message: string;
    dataConsentAcceptedAt: Date | null;
    dataConsentVersion: string | null;
  }> {
    const acceptedAt = new Date();
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const beforeValue = await this.getUserAuditSnapshot(tx, userId);
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          dataProcessingConsentAcceptedAt: acceptedAt,
          dataProcessingConsentVersion: STAFF_DATA_CONSENT_VERSION,
        },
        select: {
          id: true,
          email: true,
          roleType: true,
          dataProcessingConsentAcceptedAt: true,
          dataProcessingConsentVersion: true,
        },
      });
      const afterValue = await this.getUserAuditSnapshot(tx, updated.id);

      if (beforeValue && afterValue) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: this.buildUserActor(updated),
          entityType: 'user',
          entityId: updated.id,
          description: 'Đồng ý điều khoản xử lý dữ liệu cá nhân',
          beforeValue,
          afterValue,
        });
      }

      return updated;
    });

    this.invalidateAuthIdentityCache(userId);

    return {
      message: 'Đã ghi nhận đồng ý điều khoản xử lý dữ liệu cá nhân.',
      dataConsentAcceptedAt: updatedUser.dataProcessingConsentAcceptedAt,
      dataConsentVersion: updatedUser.dataProcessingConsentVersion,
    };
  }

  async resendVerificationEmail(
    userId: string,
    nextEmail?: string,
    emailLinkOrigin?: PublicRequestOrigin,
  ): Promise<{ message: string; email: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const normalizedNextEmail = nextEmail?.trim().toLowerCase();
    const targetEmail = normalizedNextEmail || user.email.trim().toLowerCase();
    if (!targetEmail) {
      throw new BadRequestException('Email is required for verification');
    }

    if (
      normalizedNextEmail &&
      normalizedNextEmail !== user.email.toLowerCase()
    ) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: normalizedNextEmail },
        select: { id: true },
      });
      if (existingEmail && existingEmail.id !== userId) {
        throw new BadRequestException('Email already exists');
      }
    }

    if (targetEmail !== user.email.toLowerCase()) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          email: targetEmail,
          emailVerified: false,
        },
      });
      this.invalidateAuthIdentityCache(userId);
    }

    const verificationToken = await this.generateEmailVerificationToken(
      targetEmail,
      'email-verify',
    );

    await this.sendVerificationEmailOrThrow(
      targetEmail,
      verificationToken,
      emailLinkOrigin,
    );

    return {
      message: 'Verification email sent successfully.',
      email: targetEmail,
    };
  }

  async getSessionProfile(
    refreshToken: string,
    request?: RequestWithResolvedAuthContext,
  ): Promise<AuthProfileDto | null> {
    if (!refreshToken) {
      return null;
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const device = await this.userDeviceService.assertLiveRefreshDevice({
      refreshToken,
      userId: payload.id,
      deviceId: payload.deviceId,
      roleType: payload.roleType,
    });
    if (!device) {
      return null;
    }

    return this.getAuthProfile(payload.id, request);
  }

  async revokeRefreshTokenBySession(params: {
    refreshToken?: string;
    accessToken?: string;
  }): Promise<void> {
    if (params.refreshToken) {
      const device = await this.userDeviceService.findDeviceByRefreshToken(
        params.refreshToken,
      );
      if (device) {
        await this.userDeviceService.removeDeviceById(device.id);
        this.authIdentityCacheService.invalidateHasActiveDevice(device.userId);
        this.invalidateAuthIdentityCache(device.userId);
        return;
      }
    }

    const accessDeviceId = await this.resolveDeviceIdFromAccessToken(
      params.accessToken,
    );
    if (accessDeviceId) {
      const device =
        await this.userDeviceService.findLiveDeviceById(accessDeviceId);
      await this.userDeviceService.removeDeviceById(accessDeviceId);
      const userId =
        device?.userId ??
        (await this.resolveUserIdFromSessionTokens(params));
      if (userId) {
        this.authIdentityCacheService.invalidateHasActiveDevice(userId);
        this.invalidateAuthIdentityCache(userId);
      }
      return;
    }

    const userId = await this.resolveUserIdFromSessionTokens(params);
    if (!userId) {
      return;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    this.invalidateAuthIdentityCache(userId);
  }

  invalidateAuthIdentityCache(userId: string) {
    this.authIdentityCacheService.invalidateUser(userId);
  }

  async createPendingUserWithVerificationEmail(
    data: ProvisionUserInput,
    options: ProvisionUserOptions = {},
  ): Promise<{ message: string }> {
    const existingUser = await this.findExistingUserForProvisioning(data);
    const passwordHash = await bcrypt.hash(data.password, 10);
    let persistedUserId: string | null = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        const beforeValue = existingUser
          ? await this.getUserAuditSnapshot(tx, existingUser.id)
          : null;
        const persistedUser = await tx.user.upsert({
          where: { email: data.email },
          create: {
            email: data.email,
            phone: data.phone,
            passwordHash,
            first_name: data.first_name,
            last_name: data.last_name,
            roleType: UserRole.guest,
            province: data.province,
            accountHandle: data.accountHandle,
            ...(options.emailVerified !== undefined
              ? { emailVerified: options.emailVerified }
              : {}),
          },
          update: {
            email: data.email,
            phone: data.phone,
            passwordHash,
            first_name: data.first_name,
            last_name: data.last_name,
            roleType: UserRole.guest,
            province: data.province,
            accountHandle: data.accountHandle,
            ...(options.emailVerified !== undefined
              ? { emailVerified: options.emailVerified }
              : {}),
          },
        });
        persistedUserId = persistedUser.id;

        const afterValue = await this.getUserAuditSnapshot(
          tx,
          persistedUser.id,
        );
        if (!afterValue) {
          return;
        }

        const actor = options.auditActor ?? this.buildUserActor(persistedUser);
        if (beforeValue) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor,
            entityType: 'user',
            entityId: persistedUser.id,
            description:
              options.updateDescription ?? 'Cập nhật người dùng qua đăng ký',
            beforeValue,
            afterValue,
          });
          return;
        }

        await this.actionHistoryService.recordCreate(tx, {
          actor,
          entityType: 'user',
          entityId: persistedUser.id,
          description: options.createDescription ?? 'Đăng ký người dùng',
          afterValue,
        });
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Email or account handle already exists');
      }

      throw error;
    }

    if (persistedUserId) {
      this.invalidateAuthIdentityCache(persistedUserId);
    }

    if (!options.emailVerified) {
      const verificationToken = await this.generateEmailVerificationToken(
        data.email,
        'email-verify',
      );

      await this.sendVerificationEmailOrThrow(
        data.email,
        verificationToken,
        options.emailLinkOrigin,
      );
    }

    return {
      message:
        options.successMessage ??
        (options.emailVerified
          ? 'User created successfully.'
          : 'User created successfully. Please verify your email.'),
    };
  }

  async register(data: CreateUserDto): Promise<{ message: string }> {
    return this.createPendingUserWithVerificationEmail(data);
  }

  async verifyEmailToken(token: string): Promise<{ message: string }> {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }

    let payload: EmailVerifyPayload;
    try {
      payload = await this.jwtService.verifyAsync<EmailVerifyPayload>(token, {
        secret: this.emailVerifySecret,
      });
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (payload.purpose !== 'email-verify' || !payload.email) {
      throw new BadRequestException('Invalid verification token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: payload.email },
      select: {
        id: true,
        email: true,
        roleType: true,
        emailVerified: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.emailVerified) {
      return { message: 'Email already verified' };
    }

    await this.prisma.$transaction(async (tx) => {
      const beforeValue = await this.getUserAuditSnapshot(tx, user.id);

      const updatedUser = await tx.user.update({
        where: { email: payload.email },
        data: { emailVerified: true },
        select: {
          id: true,
          email: true,
          roleType: true,
        },
      });

      const afterValue = await this.getUserAuditSnapshot(tx, updatedUser.id);
      if (!beforeValue || !afterValue) {
        return;
      }

      await this.actionHistoryService.recordUpdate(tx, {
        actor: this.buildUserActor(updatedUser),
        entityType: 'user',
        entityId: updatedUser.id,
        description: 'Xác thực email',
        beforeValue,
        afterValue,
      });
    });

    this.invalidateAuthIdentityCache(user.id);

    return { message: 'Email verified successfully' };
  }

  async forgotPassword(
    email: string,
    emailLinkOrigin?: PublicRequestOrigin,
  ): Promise<{ message: string }> {
    const genericResponse = {
      message:
        'If the account exists and is verified, a password reset email will be sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return genericResponse;
    }

    if (!user.emailVerified) {
      return genericResponse;
    }

    const forgotPasswordToken = await this.generateEmailVerificationToken(
      user.email,
      'forgot-password',
      this.getPasswordResetVersion(user.email, user.passwordHash),
    );
    try {
      await this.mailService.sendForgotPasswordEmail(
        user.email,
        forgotPasswordToken,
        emailLinkOrigin,
      );
    } catch {
      throw new InternalServerErrorException(
        'Unable to send forgot password email',
      );
    }

    return genericResponse;
  }

  async issueTokenPairForUser(
    userId: string,
    accountHandle: string,
    roleType: UserRole,
    rememberMe = false,
    options?: {
      deviceId?: string;
      deviceInfo?: DeviceInfo;
      ipAddress?: string;
    },
  ): Promise<TokenPair> {
    const deviceId =
      options?.deviceId ??
      (
        await this.userDeviceService.createDevice({
          userId,
          token: this.userDeviceService.generateDeviceToken(),
          deviceInfo: options?.deviceInfo,
          ipAddress: options?.ipAddress,
        })
      ).id;

    return this.generateTokenPairAndSave(
      userId,
      accountHandle,
      roleType,
      rememberMe,
      deviceId,
    );
  }

  async generateTokenPairAndSave(
    userId: string,
    accountHandle: string,
    roleType: UserRole,
    rememberMe = false,
    deviceId: string,
  ): Promise<TokenPair> {
    const payload = {
      id: userId,
      accountHandle,
      roleType,
      rememberMe,
      deviceId,
    };
    const refreshTokenOptions: JwtSignOptions = {
      expiresIn: rememberMe
        ? this.refreshTokenRememberExpiresIn
        : this.refreshTokenDefaultExpiresIn,
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, this.accessTokenOptions),
      this.jwtService.signAsync(payload, refreshTokenOptions),
    ]);

    await this.userDeviceService.bindRefreshToken(deviceId, refreshToken);

    return {
      accessToken,
      refreshToken,
    };
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ message: string }> {
    if (!token) {
      throw new BadRequestException('Reset password token is required');
    }

    let payload: EmailVerifyPayload;
    try {
      payload = await this.jwtService.verifyAsync<EmailVerifyPayload>(token, {
        secret: this.forgotPasswordSecret,
      });
    } catch {
      throw new BadRequestException('Invalid or expired reset password token');
    }

    if (payload.purpose !== 'forgot-password' || !payload.email) {
      throw new BadRequestException('Invalid reset password token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: payload.email },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (
      payload.passwordResetVersion !==
      this.getPasswordResetVersion(payload.email, user.passwordHash)
    ) {
      throw new BadRequestException('Invalid or expired reset password token');
    }

    await this.userDeviceService.removeAllDevicesForUser(user.id);
    this.authIdentityCacheService.invalidateHasActiveDevice(user.id);

    await this.prisma.$transaction(async (tx) => {
      const beforeValue = await this.getUserAuditSnapshot(tx, user.id);
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(password, 10),
          refreshToken: null,
        },
        select: {
          id: true,
          email: true,
          roleType: true,
        },
      });

      const afterValue = await this.getUserAuditSnapshot(tx, updatedUser.id);
      if (!beforeValue || !afterValue) {
        return;
      }

      await this.actionHistoryService.recordUpdate(tx, {
        actor: this.buildUserActor(updatedUser),
        entityType: 'user',
        entityId: updatedUser.id,
        description: 'Đặt lại mật khẩu',
        beforeValue,
        afterValue,
      });
    });

    this.invalidateAuthIdentityCache(user.id);

    return { message: 'Password reset successfully' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('User not found');
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    await this.userDeviceService.removeAllDevicesForUser(userId);
    this.authIdentityCacheService.invalidateHasActiveDevice(userId);

    await this.prisma.$transaction(async (tx) => {
      const beforeValue = await this.getUserAuditSnapshot(tx, userId);
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 10),
          refreshToken: null,
        },
        select: {
          id: true,
          email: true,
          roleType: true,
        },
      });

      const afterValue = await this.getUserAuditSnapshot(tx, updatedUser.id);
      if (!beforeValue || !afterValue) {
        return;
      }

      await this.actionHistoryService.recordUpdate(tx, {
        actor: this.buildUserActor(updatedUser),
        entityType: 'user',
        entityId: updatedUser.id,
        description: 'Đổi mật khẩu',
        beforeValue,
        afterValue,
      });
    });

    this.invalidateAuthIdentityCache(userId);

    return { message: 'Đổi mật khẩu thành công' };
  }

  async setupPassword(
    userId: string,
    password: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.passwordHash) {
      throw new BadRequestException('Tài khoản này đã có mật khẩu');
    }

    await this.prisma.$transaction(async (tx) => {
      const beforeValue = await this.getUserAuditSnapshot(tx, userId);
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: await bcrypt.hash(password, 10),
          refreshToken: null,
        },
        select: {
          id: true,
          email: true,
          roleType: true,
        },
      });

      const afterValue = await this.getUserAuditSnapshot(tx, updatedUser.id);
      if (!beforeValue || !afterValue) {
        return;
      }

      await this.actionHistoryService.recordUpdate(tx, {
        actor: this.buildUserActor(updatedUser),
        entityType: 'user',
        entityId: updatedUser.id,
        description: 'Thiết lập mật khẩu ban đầu qua Google OAuth',
        beforeValue,
        afterValue,
      });
    });

    this.invalidateAuthIdentityCache(userId);

    return { message: 'Thiết lập mật khẩu thành công' };
  }

  private async generateEmailVerificationToken(
    email: string,
    purpose: 'email-verify' | 'forgot-password',
    passwordResetVersion?: string,
  ): Promise<string> {
    const payload: EmailVerifyPayload = {
      email,
      purpose,
      ...(passwordResetVersion ? { passwordResetVersion } : {}),
    };
    const tokenOptions =
      purpose === 'forgot-password'
        ? this.forgotPasswordTokenOptions
        : this.emailVerifyTokenOptions;
    const token = await this.jwtService.signAsync(payload, tokenOptions);
    return token;
  }

  private getPasswordResetVersion(
    email: string,
    passwordHash: string | null,
  ): string {
    return createHash('sha256')
      .update(this.forgotPasswordSecret)
      .update(':')
      .update(email.trim().toLowerCase())
      .update(':')
      .update(passwordHash ?? 'no-password')
      .digest('hex');
  }

  private async sendVerificationEmailOrThrow(
    email: string,
    token: string,
    emailLinkOrigin?: PublicRequestOrigin,
  ): Promise<void> {
    try {
      await this.mailService.sendVerificationEmail(
        email,
        token,
        emailLinkOrigin,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Không gửi được email xác thực. Vui lòng thử lại hoặc liên hệ quản trị viên.',
      );
    }
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      return await this.jwtService.verifyAsync<{
        id: string;
        accountHandle: string;
        roleType: UserRole;
        deviceId?: string;
      }>(refreshToken, {
        secret: this.refreshTokenSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async resolveDeviceIdFromAccessToken(
    accessToken?: string,
  ): Promise<string | null> {
    if (!accessToken) {
      return null;
    }

    try {
      const accessPayload = await this.jwtService.verifyAsync<{
        deviceId?: string;
      }>(accessToken, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      return accessPayload.deviceId ?? null;
    } catch {
      return null;
    }
  }

  private async resolveUserIdFromSessionTokens(params: {
    refreshToken?: string;
    accessToken?: string;
  }): Promise<string | null> {
    if (params.refreshToken) {
      try {
        const refreshPayload = await this.verifyRefreshToken(
          params.refreshToken,
        );
        return refreshPayload.id;
      } catch {
        // Ignore invalid refresh cookies and fall back to access token logout.
      }
    }

    if (!params.accessToken) {
      return null;
    }

    try {
      const accessPayload = await this.jwtService.verifyAsync<{ id: string }>(
        params.accessToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );
      return accessPayload.id ?? null;
    } catch {
      return null;
    }
  }

  // ─── Student single-device login ─────────────────────────────────────

  async studentLoginInit(
    accountHandle: string,
    password: string,
    deviceInfo?: DeviceInfo,
    ipAddress?: string,
    emailLinkOrigin?: PublicRequestOrigin,
  ): Promise<{ requestId: string; activateSecret: string; message: string }> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ accountHandle }, { email: accountHandle }],
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        roleType: true,
        emailVerified: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password before revealing account type (prevents enumeration)
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.roleType !== UserRole.student) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'NOT_STUDENT_ACCOUNT',
        message: 'Tài khoản này không phải tài khoản học sinh.',
      });
    }

    if (!user.emailVerified) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'EMAIL_NOT_VERIFIED',
        message:
          'Email chưa được xác minh. Vui lòng xác minh email trước khi đăng nhập.',
      });
    }

    // Lazy cleanup: remove expired login requests and inactive devices
    await Promise.all([
      this.userDeviceService.cleanupExpiredLoginRequests(),
      this.userDeviceService.cleanupInactiveDevices(),
    ]);

    // Check if student already has an active device
    const hasActive = await this.userDeviceService.hasActiveDevice(user.id);
    if (hasActive) {
      throw new ConflictException({
        statusCode: 409,
        error: 'DEVICE_ACTIVE',
        message:
          'Tài khoản đang đăng nhập ở thiết bị khác. Vui lòng đăng xuất thiết bị cũ hoặc liên hệ quản trị viên.',
      });
    }

    // Create login request
    const loginRequestToken =
      this.userDeviceService.generateLoginRequestToken();
    const activateSecret = this.userDeviceService.generateActivateSecret();
    const loginRequest = await this.userDeviceService.createLoginRequest({
      userId: user.id,
      token: loginRequestToken,
      activateSecret,
      deviceInfo,
      ipAddress,
    });

    const frontendUrl = resolvePublicFrontendUrl({
      configuredUrl: this.configService.get<string>('FRONTEND_URL'),
      backendUrl: this.configService.get<string>('BACKEND_URL'),
      publicHost: this.configService.get<string>('VPS_PUBLIC_HOST'),
      requestHost: emailLinkOrigin?.host,
      requestProtocol: emailLinkOrigin?.protocol,
      nodeEnv: process.env.NODE_ENV,
    });
    const verifyUrl = `${frontendUrl}/auth/verify-login?token=${encodeURIComponent(loginRequestToken)}`;

    try {
      await this.mailService.sendLoginVerificationEmail(user.email, verifyUrl);
    } catch (error) {
      this.logger.error(
        `Failed to send login verification email to ${user.email}`,
        error instanceof Error ? error.stack : error,
      );
      // Don't fail the request — email sending is best-effort
    }

    return {
      requestId: loginRequest.id,
      activateSecret,
      message:
        'Đã gửi email xác minh. Vui lòng kiểm tra hộp thư và bấm liên kết để hoàn tất đăng nhập.',
    };
  }

  async studentLoginPoll(requestId: string): Promise<{ verified: boolean }> {
    const request = await this.prisma.loginRequest.findUnique({
      where: { id: requestId },
      select: { verified: true, expiresAt: true },
    });

    if (!request) {
      throw new NotFoundException('Login request not found');
    }

    if (new Date() > request.expiresAt) {
      throw new BadRequestException('Login request expired');
    }

    return { verified: request.verified };
  }

  async activateStudentDevice(
    requestId: string,
    activateSecret: string,
    rememberMe = false,
  ): Promise<TokenPair> {
    const request = await this.prisma.loginRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        userId: true,
        verified: true,
        expiresAt: true,
        activateSecretHash: true,
        deviceInfo: true,
        ipAddress: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Login request not found');
    }

    if (!request.verified) {
      throw new BadRequestException('Login request not verified yet');
    }

    if (new Date() > request.expiresAt) {
      throw new BadRequestException('Login request expired');
    }

    // Verify activate secret
    if (
      !request.activateSecretHash ||
      this.userDeviceService.hashToken(activateSecret) !==
        request.activateSecretHash
    ) {
      throw new UnauthorizedException('Invalid activation secret');
    }

    // Remove any existing devices for this student (single-device rule)
    await this.userDeviceService.removeAllDevicesForUser(request.userId);
    this.authIdentityCacheService.invalidateHasActiveDevice(request.userId);

    // Create the device
    const deviceToken = this.userDeviceService.generateDeviceToken();
    const device = await this.userDeviceService.createDevice({
      userId: request.userId,
      token: deviceToken,
      deviceInfo: request.deviceInfo as DeviceInfo | undefined,
      ipAddress: request.ipAddress ?? undefined,
    });

    // Get user info for token generation
    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        id: true,
        accountHandle: true,
        roleType: true,
      },
    });

    if (!user) {
      throw new InternalServerErrorException(
        'User not found after verification',
      );
    }

    // Generate JWT tokens
    const tokenPair = await this.generateTokenPairAndSave(
      user.id,
      user.accountHandle,
      user.roleType,
      rememberMe,
      device.id,
    );

    // Cleanup the login request
    await this.prisma.loginRequest.delete({ where: { id: request.id } });

    return tokenPair;
  }

  /**
   * Máy bấm magic link trong email. KHÔNG set cookie hay tạo phiên trên máy
   * này — thiết bị được kích hoạt luôn là máy khởi tạo (màn "Chờ xác minh").
   * Trả `status` để FE hiển thị thông báo riêng cho từng case:
   * `verified` / `used` (link đã được bấm trước đó) / `expired` / `invalid`.
   */
  async verifyLoginMagicLink(token: string): Promise<{
    status: 'verified' | 'used' | 'expired' | 'invalid';
    message: string;
    verified: boolean;
  }> {
    if (!token) {
      return {
        status: 'invalid',
        message: 'Liên kết không hợp lệ.',
        verified: false,
      };
    }

    const tokenHash = this.userDeviceService.hashToken(token);
    const request =
      await this.userDeviceService.findLoginRequestByTokenHash(tokenHash);

    if (!request) {
      return {
        status: 'invalid',
        message:
          'Liên kết không hợp lệ hoặc đã bị cắt mất phần token. Vui lòng đăng nhập lại.',
        verified: false,
      };
    }

    if (new Date() > request.expiresAt) {
      return {
        status: 'expired',
        message:
          'Liên kết xác minh đã hết hạn. Vui lòng đăng nhập lại để nhận liên kết mới.',
        verified: false,
      };
    }

    if (request.verified) {
      return {
        status: 'used',
        message:
          'Liên kết này đã được sử dụng. Quay lại thiết bị vừa đăng nhập để hoàn tất.',
        verified: true,
      };
    }

    await this.userDeviceService.verifyLoginRequest(tokenHash);
    return {
      status: 'verified',
      message:
        'Đã xác minh thành công. Quay lại thiết bị vừa đăng nhập để hoàn tất.',
      verified: true,
    };
  }

  async forceLogoutStudent(
    studentId: string,
    actorId: string,
  ): Promise<{ message: string }> {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, email: true, roleType: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (student.roleType !== UserRole.student) {
      throw new BadRequestException('Target must be a student account');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, email: true, roleType: true },
    });

    if (!actor) {
      throw new UnauthorizedException('Actor not found');
    }

    // Remove all devices
    await this.userDeviceService.removeAllDevicesForUser(studentId);
    this.authIdentityCacheService.invalidateHasActiveDevice(studentId);

    // Invalidate refresh token
    await this.prisma.user.update({
      where: { id: studentId },
      data: { refreshToken: null },
    });
    this.invalidateAuthIdentityCache(studentId);

    // Audit trail
    await this.actionHistoryService.recordUpdate(this.prisma, {
      actor: this.buildUserActor(actor),
      entityType: 'user_device',
      entityId: studentId,
      description: `Buộc đăng xuất học sinh ${student.email}`,
      beforeValue: { studentId },
      afterValue: { forceLogout: true },
    });

    return { message: 'Đã buộc đăng xuất học sinh' };
  }

  async studentSelfLogout(userId: string): Promise<{ message: string }> {
    // Remove all devices
    await this.userDeviceService.removeAllDevicesForUser(userId);
    this.authIdentityCacheService.invalidateHasActiveDevice(userId);

    // Also invalidate refresh token
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    this.invalidateAuthIdentityCache(userId);

    return { message: 'Đã đăng xuất' };
  }

  async touchStudentDevice(deviceTokenHash: string) {
    await this.userDeviceService.touchDevice(deviceTokenHash);
  }

  private readonly logger = new Logger(AuthService.name);
}
