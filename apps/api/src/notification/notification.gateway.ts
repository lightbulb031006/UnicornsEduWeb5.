import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { AuthIdentityCacheService } from 'src/auth/auth-identity-cache.service';
import type { NotificationTargetRoleTypeDto } from 'src/dtos/notification.dto';
import type { NotificationPushEventDto } from 'src/dtos/notification.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { StaffRole, StaffStatus, UserRole, UserStatus } from 'generated/enums';

const ACCESS_TOKEN_COOKIE = 'access_token';
const NOTIFICATION_ALL_ROOM = 'notifications:all';

interface AccessTokenPayload {
  id: string;
}

interface NotificationTargetingState {
  targetAll: boolean;
  targetRoleTypes: NotificationTargetRoleTypeDto[];
  targetStaffRoles: StaffRole[];
  targetUserIds: string[];
}

interface NotificationSocketAuthContext {
  userId: string;
  roleType: NotificationTargetRoleTypeDto;
  staffRoles: StaffRole[];
}

type NotificationSocketData = {
  authContext?: NotificationSocketAuthContext;
};

function parseCookies(rawCookieHeader?: string): Record<string, string> {
  if (!rawCookieHeader) {
    return {};
  }

  return rawCookieHeader
    .split(';')
    .reduce<Record<string, string>>((cookies, rawSegment) => {
      const segment = rawSegment.trim();
      if (!segment) {
        return cookies;
      }

      const separatorIndex = segment.indexOf('=');
      if (separatorIndex < 0) {
        return cookies;
      }

      const key = segment.slice(0, separatorIndex).trim();
      const rawValue = segment.slice(separatorIndex + 1);

      if (!key) {
        return cookies;
      }

      try {
        cookies[key] = decodeURIComponent(rawValue);
      } catch {
        cookies[key] = rawValue;
      }

      return cookies;
    }, {});
}

function roleRoom(roleType: NotificationTargetRoleTypeDto) {
  return `notifications:role:${roleType}`;
}

function userRoom(userId: string) {
  return `notifications:user:${userId}`;
}

function staffRoleRoom(role: StaffRole) {
  return `notifications:staff-role:${role}`;
}

@Injectable()
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: process.env.FRONTEND_URL ?? true,
    credentials: true,
  },
})
export class NotificationGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly authIdentityCacheService: AuthIdentityCacheService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    server.use((rawSocket, next) => {
      void this.authenticateSocket(rawSocket)
        .then((authContext) => {
          this.setAuthContext(rawSocket, authContext);
          next();
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Unauthorized';
          next(new Error(message));
        });
    });
  }

  handleConnection(client: Socket) {
    const authContext = this.getAuthContext(client);
    if (!authContext) {
      client.disconnect(true);
      return;
    }

    void client.join(this.resolveRooms(authContext));
  }

  emitNotificationPushed(
    payload: NotificationPushEventDto,
    targeting: NotificationTargetingState,
  ) {
    if (!this.server) {
      return;
    }

    const rooms = this.resolveTargetRooms(targeting);
    if (rooms.length === 0) {
      return;
    }

    this.server.to(rooms).emit('notification.pushed', payload);
  }

  private async authenticateSocket(
    socket: Socket,
  ): Promise<NotificationSocketAuthContext> {
    const rawCookieHeader = socket.handshake.headers.cookie;
    const accessToken = parseCookies(rawCookieHeader)[ACCESS_TOKEN_COOKIE];

    if (!accessToken) {
      throw new UnauthorizedException('Missing access token');
    }

    const payload =
      await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken);
    const identity = await this.authIdentityCacheService.getAuthIdentity(
      payload.id,
    );

    if (!identity || identity.status !== UserStatus.active) {
      throw new UnauthorizedException('Inactive account');
    }

    if (identity.roleType === UserRole.admin) {
      return {
        userId: identity.id,
        roleType: UserRole.admin,
        staffRoles: [],
      };
    }

    if (identity.roleType === UserRole.staff) {
      const staff = await this.prisma.staffInfo.findUnique({
        where: { userId: identity.id },
        select: {
          status: true,
          roles: true,
        },
      });

      if (!staff || staff.status !== StaffStatus.active) {
        throw new UnauthorizedException('Staff profile is not available');
      }

      return {
        userId: identity.id,
        roleType: UserRole.staff,
        staffRoles: staff.roles ?? [],
      };
    }

    throw new UnauthorizedException(
      'Only eligible admin or staff accounts can receive notifications',
    );
  }

  private resolveRooms(authContext: NotificationSocketAuthContext) {
    const rooms = [
      NOTIFICATION_ALL_ROOM,
      roleRoom(authContext.roleType),
      userRoom(authContext.userId),
    ];

    if (authContext.roleType === UserRole.staff) {
      authContext.staffRoles.forEach((role) => {
        rooms.push(staffRoleRoom(role));
      });
    }

    return rooms;
  }

  private resolveTargetRooms(targeting: NotificationTargetingState) {
    if (targeting.targetAll) {
      return [NOTIFICATION_ALL_ROOM];
    }

    const rooms = new Set<string>();

    targeting.targetRoleTypes.forEach((roleType) => {
      rooms.add(roleRoom(roleType));
    });
    targeting.targetStaffRoles.forEach((role) => {
      rooms.add(staffRoleRoom(role));
    });
    targeting.targetUserIds.forEach((userId) => {
      rooms.add(userRoom(userId));
    });

    return Array.from(rooms);
  }

  private setAuthContext(
    socket: Socket,
    authContext: NotificationSocketAuthContext,
  ) {
    const socketData = socket.data as NotificationSocketData;
    socketData.authContext = authContext;
  }

  private getAuthContext(socket: Socket) {
    const socketData = socket.data as NotificationSocketData;
    return socketData.authContext;
  }
}
