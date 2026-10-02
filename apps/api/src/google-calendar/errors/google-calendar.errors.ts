import { HttpStatus, Injectable } from '@nestjs/common';

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(message);
    this.name = 'GoogleCalendarError';
  }
}

export class GoogleCalendarAuthError extends GoogleCalendarError {
  constructor(message = 'Failed to authenticate with Google Calendar') {
    super(message, HttpStatus.UNAUTHORIZED);
    this.name = 'GoogleCalendarAuthError';
  }
}

export class GoogleCalendarInvalidConfigurationError extends GoogleCalendarError {
  constructor(message = 'Invalid Google Calendar configuration') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
    this.name = 'GoogleCalendarInvalidConfigurationError';
  }
}

export class GoogleCalendarApiError extends GoogleCalendarError {
  constructor(
    message: string,
    public googleError?: Error & { errors?: unknown[] },
  ) {
    super(
      message || 'Google Calendar API request failed',
      HttpStatus.BAD_GATEWAY,
    );
    this.name = 'GoogleCalendarApiError';
  }
}

export class GoogleCalendarTimeoutError extends GoogleCalendarError {
  constructor(message = 'Google Calendar request timed out') {
    super(message, HttpStatus.GATEWAY_TIMEOUT);
    this.name = 'GoogleCalendarTimeoutError';
  }
}
