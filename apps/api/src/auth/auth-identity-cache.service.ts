import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StaffRole } from 'generated/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  CachedAuthIdentity,
  RequestWithResolvedAuthContext,
} from './auth-request-context';

interface CacheEntry<T> {
  expiresAt: number;
  lastAccessedAt: number;
  value: T;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsedValue = Number.parseInt(value ?? '', 10);

  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

@Injectable()
export class AuthIdentityCacheService {
  private readonly identityTtlMs: number;
  private readonly maxEntries: number;
  private readonly authIdentityCache = new Map<
    string,
    CacheEntry<CachedAuthIdentity | null>
  >();
  private readonly staffRolesCache = new Map<string, CacheEntry<StaffRole[]>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.identityTtlMs = parsePositiveInteger(
      this.configService.get<string>('AUTH_IDENTITY_CACHE_TTL_MS'),
      5_000,
    );
    this.maxEntries = parsePositiveInteger(
      this.configService.get<string>('AUTH_IDENTITY_CACHE_MAX_ENTRIES'),
      2_000,
    );
  }

  async getAuthIdentity(
    userId: string,
    request?: RequestWithResolvedAuthContext,
  ): Promise<CachedAuthIdentity | null> {
    const requestIdentity = request?.resolvedAuthIdentity;

    if (requestIdentity === null) {
      return null;
    }

    if (requestIdentity && requestIdentity.id === userId) {
      return requestIdentity;
    }

    const cachedIdentity = this.readFromCache(this.authIdentityCache, userId);
    if (cachedIdentity !== undefined) {
      if (request) {
        request.resolvedAuthIdentity = cachedIdentity;
      }
      return cachedIdentity;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        dataProcessingConsentAcceptedAt: true,
        dataProcessingConsentVersion: true,
        accountHandle: true,
        roleType: true,
        status: true,
        passwordHash: true,
        avatarPath: true,
      },
    });

    const identity = user
      ? {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          dataProcessingConsentAcceptedAt: user.dataProcessingConsentAcceptedAt,
          dataProcessingConsentVersion: user.dataProcessingConsentVersion,
          accountHandle: user.accountHandle,
          roleType: user.roleType,
          status: user.status,
          requiresPasswordSetup: !user.passwordHash,
          avatarPath: user.avatarPath,
        }
      : null;

    this.writeToCache(this.authIdentityCache, userId, identity);
    if (request) {
      request.resolvedAuthIdentity = identity;
    }

    return identity;
  }

  async getStaffRoles(
    userId: string,
    request?: RequestWithResolvedAuthContext,
  ): Promise<StaffRole[]> {
    if (request?.resolvedStaffRoles) {
      return request.resolvedStaffRoles;
    }

    const cachedRoles = this.readFromCache(this.staffRolesCache, userId);
    if (cachedRoles !== undefined) {
      if (request) {
        request.resolvedStaffRoles = cachedRoles;
      }
      return cachedRoles;
    }

    const staff = await this.prisma.staffInfo.findUnique({
      where: { userId },
      select: { roles: true },
    });
    const roles = staff?.roles ?? [];

    this.writeToCache(this.staffRolesCache, userId, roles);
    if (request) {
      request.resolvedStaffRoles = roles;
    }

    return roles;
  }

  invalidateUser(userId: string) {
    this.authIdentityCache.delete(userId);
    this.staffRolesCache.delete(userId);
  }

  private readFromCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
  ): T | undefined {
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (entry.expiresAt <= now) {
      cache.delete(key);
      return undefined;
    }

    entry.lastAccessedAt = now;
    return entry.value;
  }

  private writeToCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
  ) {
    const now = Date.now();
    cache.set(key, {
      value,
      expiresAt: now + this.identityTtlMs,
      lastAccessedAt: now,
    });

    this.pruneExpiredEntries(cache, now);
    this.pruneOldestEntries(cache);
  }

  private pruneExpiredEntries<T>(
    cache: Map<string, CacheEntry<T>>,
    now: number,
  ) {
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }
  }

  private pruneOldestEntries<T>(cache: Map<string, CacheEntry<T>>) {
    while (cache.size > this.maxEntries) {
      let oldestKey: string | null = null;
      let oldestAccess = Number.POSITIVE_INFINITY;

      for (const [key, entry] of cache.entries()) {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestAccess = entry.lastAccessedAt;
          oldestKey = key;
        }
      }

      if (!oldestKey) {
        return;
      }

      cache.delete(oldestKey);
    }
  }
}
