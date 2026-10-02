import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { readProxyPublicOrigin } from '../mail/public-frontend-url';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { Public } from './decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';
import {
  CurrentUser,
  type JwtPayload,
  type JwtRefreshPayload,
} from './decorators/current-user.decorator';
import {
  CreateUserDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResendVerificationDto,
  ResetPasswordDto,
  SetupPasswordDto,
  UserAuthDto,
} from '../dtos/user.dto';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from 'generated/enums';
import { JwtService } from '@nestjs/jwt';
import type { RequestWithResolvedAuthContext } from './auth-request-context';
import { PUBLIC_REGISTRATION_DISABLED_MESSAGE } from './constants';
import { GoogleAuthExceptionFilter } from './filters/google-auth.exception-filter';
import { UserDeviceService } from './user-device.service';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { StudentDeviceGuard } from './guards/student-device.guard';

const ONE_MINUTE_IN_MS = 60_000;
const THIRTY_MINUTES_IN_MS = 30 * ONE_MINUTE_IN_MS;
const ONE_HOUR_IN_MS = 60 * ONE_MINUTE_IN_MS;

interface VerifiedTokenPayload {
  id: string;
  accountHandle: string;
  roleType: UserRole;
  rememberMe?: boolean;
  deviceId?: string;
}

interface GoogleAuthRequest extends Request {
  user: {
    id: string;
    accountHandle: string;
    roleType: UserRole;
    passwordHash?: string | null;
  };
}

function readCookie(req: Request, cookieName: string): string {
  const cookieValue: unknown = req.cookies?.[cookieName];
  return typeof cookieValue === 'string' ? cookieValue : '';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userDeviceService: UserDeviceService,
  ) {}

  private getGuestProfile() {
    return {
      id: '',
      email: '',
      emailVerified: false,
      dataConsentAcceptedAt: null,
      dataConsentVersion: null,
      requiresStaffDataConsent: false,
      canAccessRestrictedRoutes: false,
      accountHandle: '',
      roleType: UserRole.guest,
      requiresPasswordSetup: false,
      avatarUrl: null,
      staffRoles: [],
      hasStaffProfile: false,
      hasStudentProfile: false,
      effectiveRoleTypes: [UserRole.guest],
      staffProfileComplete: false,
      availableWorkspaces: [],
      defaultWorkspace: null,
      preferredRedirect: '/',
      access: {
        admin: { canAccess: false, tier: null },
        staff: { canAccess: false, profileComplete: false },
        student: { canAccess: false },
      },
    };
  }

  private getOptionalAccessTokenPayload(
    req: Request,
  ): VerifiedTokenPayload | null {
    const accessToken = readCookie(req, 'access_token');
    if (!accessToken) {
      return null;
    }

    try {
      return this.jwtService.verify<VerifiedTokenPayload>(accessToken, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      return null;
    }
  }

  private getVerifiedAccessTokenPayload(req: Request): VerifiedTokenPayload {
    const payload = this.getOptionalAccessTokenPayload(req);

    if (!payload) {
      throw new UnauthorizedException('Unauthorized');
    }

    return payload;
  }

  private async getAuthenticatedUserIdFromCookies(
    req: RequestWithResolvedAuthContext,
  ): Promise<string> {
    const accessPayload = this.getOptionalAccessTokenPayload(req);
    if (accessPayload?.id) {
      return accessPayload.id;
    }

    const refreshToken = readCookie(req, 'refresh_token');
    if (refreshToken) {
      try {
        const profile = await this.authService.getSessionProfile(
          refreshToken,
          req,
        );
        if (profile?.id) {
          return profile.id;
        }
      } catch {
        // Fall through to the generic unauthorized response below.
      }
    }

    throw new UnauthorizedException('Unauthorized');
  }

  private setAuthCookies(
    res: Response,
    tokenPair: { accessToken: string; refreshToken: string },
    rememberMe = false,
  ) {
    const refreshMaxAge = rememberMe
      ? this.authService.refreshTokenRememberExpiresIn * 1000
      : this.authService.refreshTokenDefaultExpiresIn * 1000;

    res.cookie('access_token', tokenPair.accessToken, {
      ...this.getAuthCookieOptions(),
      maxAge: this.authService.accessTokenExpiresIn * 1000,
    });
    res.cookie('refresh_token', tokenPair.refreshToken, {
      ...this.getAuthCookieOptions(),
      maxAge: refreshMaxAge,
    });
  }

  private getAuthCookieOptions(): Pick<
    CookieOptions,
    'httpOnly' | 'secure' | 'sameSite'
  > {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
    };
  }

  private buildFrontendRedirectUrl(
    path = '',
    search?: URLSearchParams,
  ): string {
    const frontendUrl = this.configService
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');
    const query = search && search.size > 0 ? `?${search.toString()}` : '';
    return `${frontendUrl}${path}${query}`;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Login',
    description:
      'Authenticate with accountHandle and password (accountHandle can be username or email). Returns access token and sets refresh token in cookie.',
  })
  @ApiBody({
    type: UserAuthDto,
    description:
      'accountHandle (username or email), password, and optional rememberMe',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns accessToken and refreshToken.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async login(
    @Body() body: UserAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rememberMe = body.rememberMe ?? false;
    const response = await this.authService.login(
      body.accountHandle,
      body.password,
      rememberMe,
    );
    this.setAuthCookies(res, response.tokenPair, rememberMe);

    return {
      message: 'Login successful',
      id: response.id,
      accountHandle: response.accountHandle,
      roleType: response.roleType,
      avatarUrl: response.avatarUrl,
    };
  }

  @Public()
  @UseGuards(JwtRefreshGuard, StudentDeviceGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @Throttle({ default: { limit: 120, ttl: ONE_MINUTE_IN_MS } })
  @ApiOperation({
    summary: 'Refresh tokens',
    description:
      'Exchange refresh token (cookie) for a new access token and refresh token.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns new accessToken and sets new refresh token in cookie.',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token.',
  })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async refresh(
    @CurrentUser() user: JwtRefreshPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const oldRefreshToken = readCookie(req, 'refresh_token');
    const { accessToken, refreshToken } = await this.authService.refreshTokens(
      user.user.id,
      oldRefreshToken,
      user.rememberMe,
      user.deviceId,
    );

    this.setAuthCookies(res, { accessToken, refreshToken }, user.rememberMe);
    return { message: 'Refresh successful' };
  }

  @Public()
  @Get('session')
  @ApiOperation({
    summary: 'Get session',
    description:
      'Returns the current lightweight auth session resolved from the refresh_token cookie.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Current session payload for SSR, proxy, and auth bootstrap. Returns guest defaults when unauthenticated.',
  })
  async getSession(@Req() req: RequestWithResolvedAuthContext) {
    return this.resolveSessionProfile(req);
  }

  @Public()
  @Get('profile')
  @ApiOperation({
    summary: 'Get profile',
    description:
      'Returns the current user profile from JWT payload. Requires authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user profile (id, accountHandle, role, etc.).',
  })
  async getProfile(@Req() req: RequestWithResolvedAuthContext) {
    return this.resolveSessionProfile(req);
  }

  private async resolveSessionProfile(req: RequestWithResolvedAuthContext) {
    const refreshToken = readCookie(req, 'refresh_token');

    if (!refreshToken) {
      return this.getGuestProfile();
    }

    try {
      const profile = await this.authService.getSessionProfile(
        refreshToken,
        req,
      );
      return profile ?? this.getGuestProfile();
    } catch {
      return this.getGuestProfile();
    }
  }

  @Public()
  @Post('data-consent/accept')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Accept data processing consent',
    description:
      'Records the current personal data collection and processing consent version for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Data consent has been recorded for the current user.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async acceptDataConsent(@Req() req: RequestWithResolvedAuthContext) {
    const userId = await this.getAuthenticatedUserIdFromCookies(req);
    return this.authService.acceptDataConsent(userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: THIRTY_MINUTES_IN_MS } })
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Change password',
    description:
      'Change password for current user (requires access_token cookie).',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized or wrong current password.',
  })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async changePassword(@Req() req: Request, @Body() body: ChangePasswordDto) {
    const payload = this.getVerifiedAccessTokenPayload(req);

    if (!payload?.id) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.authService.changePassword(
      payload.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post('setup-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: THIRTY_MINUTES_IN_MS } })
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Set initial password',
    description:
      'Create the first password for the current authenticated user when the account was created via Google OAuth.',
  })
  @ApiBody({ type: SetupPasswordDto })
  @ApiResponse({ status: 200, description: 'Password set successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Password already exists or request is invalid.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async setupPassword(
    @Req() req: Request,
    @Body() body: SetupPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = this.getVerifiedAccessTokenPayload(req);
    if (!payload?.id) {
      throw new UnauthorizedException('Unauthorized');
    }

    const result = await this.authService.setupPassword(
      payload.id,
      body.password,
    );
    const tokenPair = await this.authService.issueTokenPairForUser(
      payload.id,
      payload.accountHandle,
      payload.roleType,
      payload.rememberMe ?? false,
      { deviceId: payload.deviceId },
    );
    this.setAuthCookies(res, tokenPair, payload.rememberMe ?? false);

    return result;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: ONE_HOUR_IN_MS } })
  @ApiOperation({
    summary: 'Register',
    description:
      'Public registration is disabled. Use admin user provisioning instead.',
  })
  @ApiBody({
    type: CreateUserDto,
    description: 'User registration payload',
  })
  @ApiResponse({
    status: 403,
    description: 'Public registration is disabled.',
  })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async register(@Body() _body: CreateUserDto) {
    throw new ForbiddenException(PUBLIC_REGISTRATION_DISABLED_MESSAGE);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Get('verify')
  @Throttle({ default: { limit: 30, ttl: ONE_HOUR_IN_MS } })
  @ApiOperation({
    summary: 'Verify email',
    description: 'Verify email address using token sent by email.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Email verification token',
  })
  @ApiResponse({ status: 200, description: 'Email verified successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token.' })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmailToken(token);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: ONE_HOUR_IN_MS } })
  @ApiOperation({
    summary: 'Forgot password',
    description: 'Request a password reset link sent to the given email.',
  })
  @ApiBody({ type: ForgotPasswordDto, description: 'Email address' })
  @ApiResponse({
    status: 200,
    description: 'Reset email sent if account exists.',
  })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(
      body.email,
      readProxyPublicOrigin(req),
    );
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: ONE_HOUR_IN_MS } })
  @ApiOperation({
    summary: 'Reset password',
    description: 'Set new password using the token from forgot-password email.',
  })
  @ApiBody({ type: ResetPasswordDto, description: 'Token and new password' })
  @ApiResponse({ status: 200, description: 'Password updated successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token.' })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Get('me')
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Get current user',
    description:
      'Returns the authenticated user (same as profile). Requires access_token cookie.',
  })
  @ApiResponse({ status: 200, description: 'Current user payload.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMe(
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithResolvedAuthContext,
  ) {
    const profile = await this.authService.getAuthProfile(user.id, req);
    if (!profile) {
      throw new UnauthorizedException('Unauthorized');
    }

    return profile;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout',
    description:
      'Clear access and refresh token cookies. Public endpoint; if auth cookies are present, revokes the matching refresh session server-side.',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeRefreshTokenBySession({
      refreshToken: readCookie(req, 'refresh_token'),
      accessToken: readCookie(req, 'access_token'),
    });

    const authCookieOptions = this.getAuthCookieOptions();

    res.clearCookie('access_token', authCookieOptions);
    res.clearCookie('refresh_token', authCookieOptions);
    return {
      message: 'Logged out successfully',
    };
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Resend verification email',
    description:
      'Resends email verification for the current authenticated session. Optionally accepts a new email and resets verification state.',
  })
  @ApiBody({ type: ResendVerificationDto, required: false })
  @ApiResponse({
    status: 200,
    description: 'Verification email has been queued for delivery.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email payload or email already in use.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async resendVerification(
    @Req() req: RequestWithResolvedAuthContext,
    @Body() body?: ResendVerificationDto,
  ) {
    const userId = await this.getAuthenticatedUserIdFromCookies(req);
    return this.authService.resendVerificationEmail(
      userId,
      body?.email,
      readProxyPublicOrigin(req),
    );
  }

  @Public()
  @Get('google')
  @UseFilters(GoogleAuthExceptionFilter)
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  // ─── Student single-device login ─────────────────────────────────────

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('student/login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Initiate student login',
    description:
      'Validates credentials and sends a magic link to the student email. Returns a requestId for polling.',
  })
  @ApiBody({
    type: UserAuthDto,
    description: 'accountHandle, password, and optional rememberMe',
  })
  @ApiResponse({
    status: 200,
    description: 'Login request created, verification email sent.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({
    status: 409,
    description: 'Student already has an active device.',
  })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async studentLogin(@Body() body: UserAuthDto, @Req() req: Request) {
    const deviceInfo = {
      userAgent: req.headers['user-agent'],
      acceptLanguage: req.headers['accept-language'],
    };
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      undefined;

    return this.authService.studentLoginInit(
      body.accountHandle,
      body.password,
      deviceInfo,
      ipAddress,
      readProxyPublicOrigin(req),
    );
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('student/login/poll')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Poll student login verification',
    description:
      'Polls the status of a student login request. Returns verified: true when the magic link has been clicked.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
      },
      required: ['requestId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Returns verification status.',
  })
  @ApiResponse({ status: 404, description: 'Request not found.' })
  async studentLoginPoll(@Body() body: { requestId: string }) {
    return this.authService.studentLoginPoll(body.requestId);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Get('verify-login')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Verify login magic link',
    description:
      'Marks a login request as verified when the student clicks the magic link from email. Never sets a session on this device — the initiating browser (waiting screen) is the only device activated. Returns an outcome status so the UI can show distinct messages: verified / used / expired / invalid.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Login verification token from email',
  })
  @ApiResponse({
    status: 200,
    description:
      'Outcome: { status: verified|used|expired|invalid, message, verified }.',
  })
  async verifyLogin(@Query('token') token: string) {
    return this.authService.verifyLoginMagicLink(token);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('student/activate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Activate student device',
    description:
      'Creates a device record and issues tokens after login request is verified.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        activateSecret: { type: 'string' },
        rememberMe: { type: 'boolean', default: false },
      },
      required: ['requestId', 'activateSecret'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Device activated, tokens issued.',
  })
  @ApiResponse({ status: 400, description: 'Request not verified or expired.' })
  @ApiResponse({ status: 401, description: 'Invalid activation secret.' })
  async studentActivate(
    @Body()
    body: { requestId: string; activateSecret: string; rememberMe?: boolean },
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokenPair = await this.authService.activateStudentDevice(
      body.requestId,
      body.activateSecret,
      body.rememberMe ?? false,
    );
    this.setAuthCookies(res, tokenPair, body.rememberMe ?? false);
    return { message: 'Đăng nhập thành công' };
  }

  @Post('student/logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Student self-logout',
    description: 'Removes the current device and invalidates the session.',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  async studentLogout(
    @Req() req: RequestWithResolvedAuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.getAuthenticatedUserIdFromCookies(req);
    await this.authService.studentSelfLogout(userId);

    const authCookieOptions = this.getAuthCookieOptions();
    res.clearCookie('access_token', authCookieOptions);
    res.clearCookie('refresh_token', authCookieOptions);
    return { message: 'Đã đăng xuất' };
  }

  @Post('admin/students/:id/force-logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.admin, UserRole.staff)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Force logout student',
    description:
      'Admin or staff force-logouts a student, removing all active devices.',
  })
  @ApiParam({ name: 'id', description: 'Student user ID' })
  @ApiResponse({ status: 200, description: 'Student force-logged out.' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions.' })
  @ApiResponse({ status: 404, description: 'Student not found.' })
  async forceLogoutStudent(
    @Param('id') studentId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.authService.forceLogoutStudent(studentId, actor.id);
  }

  @Public()
  @Get('google/callback')
  @UseFilters(GoogleAuthExceptionFilter)
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req: GoogleAuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rememberMe = true;
    const tokenPair = await this.authService.issueTokenPairForUser(
      req.user.id,
      req.user.accountHandle,
      req.user.roleType,
      rememberMe,
    );
    this.setAuthCookies(res, tokenPair, rememberMe);

    const redirectUrl = req.user.passwordHash
      ? this.buildFrontendRedirectUrl('/auth/post-login')
      : this.buildFrontendRedirectUrl(
          '/auth/setup-password',
          new URLSearchParams({ source: 'google' }),
        );

    return res.redirect(redirectUrl);
  }
}
