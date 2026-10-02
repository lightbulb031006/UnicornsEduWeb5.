import { ServiceUnavailableException } from '@nestjs/common';

const LOCAL_FRONTEND_URL = 'http://localhost:3000';

const UNSAFE_PRODUCTION_FRONTEND_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'example.com',
  'example.net',
  'example.org',
]);

export interface PublicRequestOrigin {
  host?: string | null;
  protocol?: string | null;
}

const TRUSTED_PUBLIC_SUFFIXES = ['uniedu.vn', 'unicornsedu.com'] as const;

export interface ResolvePublicFrontendUrlInput {
  configuredUrl?: string | null;
  backendUrl?: string | null;
  publicHost?: string | null;
  requestHost?: string | null;
  requestProtocol?: string | null;
  nodeEnv?: string | null;
}

export function readProxyPublicOrigin(req: {
  protocol?: string;
  headers?: {
    host?: string | string[] | undefined;
    'x-forwarded-proto'?: string | string[] | undefined;
  };
}): PublicRequestOrigin {
  const headers = req.headers ?? {};
  const forwardedProto = firstHeader(headers['x-forwarded-proto']);
  return {
    host: firstHeader(headers.host),
    protocol: forwardedProto?.split(',')[0]?.trim() || req.protocol,
  };
}

export function resolvePublicFrontendUrl(
  input: ResolvePublicFrontendUrlInput,
): string {
  const isProduction = input.nodeEnv === 'production';
  const configured = parseHttpUrl(input.configuredUrl);
  if (configured && isAcceptableOrigin(configured, isProduction)) {
    return stripTrailingSlash(configured.href);
  }

  if (isProduction) {
    const fromPublicHost = originFromPublicHost(input.publicHost);
    if (fromPublicHost && isTrustedPublicOrigin(fromPublicHost)) {
      return fromPublicHost.origin;
    }

    const fromBackend = originFromBackendUrl(input.backendUrl);
    if (fromBackend && isAcceptableOrigin(fromBackend, true)) {
      return fromBackend.origin;
    }

    const fromRequest = originFromRequest(
      input.requestHost,
      input.requestProtocol,
    );
    if (fromRequest && isTrustedPublicOrigin(fromRequest)) {
      return fromRequest.origin;
    }

    throw new ServiceUnavailableException(
      'FRONTEND_URL production phải là origin HTTPS public. Không gửi email với link localhost.',
    );
  }

  if (configured) {
    return stripTrailingSlash(configured.href);
  }

  return LOCAL_FRONTEND_URL;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseHttpUrl(value: string | null | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function originFromBackendUrl(value: string | null | undefined): URL | null {
  const url = parseHttpUrl(value);
  if (!url) {
    return null;
  }

  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '' && path !== '/api') {
    return null;
  }

  return new URL(url.origin);
}

function originFromRequest(
  host: string | null | undefined,
  protocol: string | null | undefined,
): URL | null {
  const rawHost = host?.trim();
  const rawProtocol = protocol
    ?.split(',')[0]
    ?.trim()
    .toLowerCase()
    .replace(/:$/, '');
  if (!rawHost || (rawProtocol !== 'http' && rawProtocol !== 'https')) {
    return null;
  }
  if (/[\s@/]/.test(rawHost)) {
    return null;
  }

  return parseHttpUrl(`${rawProtocol}://${rawHost}`);
}

function isAcceptableOrigin(url: URL, isProduction: boolean): boolean {
  if (!isProduction) {
    return true;
  }
  return url.protocol === 'https:' && !isUnsafeProductionHost(url.hostname);
}

function originFromPublicHost(host: string | null | undefined): URL | null {
  const trimmed = host?.trim().toLowerCase();
  if (!trimmed || /[\s@/:]/.test(trimmed)) {
    return null;
  }
  return parseHttpUrl(`https://${trimmed}`);
}

function isTrustedPublicOrigin(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    isCompanyHostname(url.hostname) &&
    !isUnsafeProductionHost(url.hostname)
  );
}

function isCompanyHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return TRUSTED_PUBLIC_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

function isUnsafeProductionHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    UNSAFE_PRODUCTION_FRONTEND_HOSTS.has(normalized) ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.example.com') ||
    normalized.endsWith('.example.net') ||
    normalized.endsWith('.example.org')
  );
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
