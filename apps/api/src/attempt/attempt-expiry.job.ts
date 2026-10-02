import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttemptService } from './attempt.service';

/** Chu kỳ chốt Attempt hết giờ khi học sinh không quay lại (đóng tab). */
export const ATTEMPT_EXPIRY_CRON = CronExpression.EVERY_MINUTE;

@Injectable()
export class AttemptExpiryJob {
  private readonly logger = new Logger(AttemptExpiryJob.name);

  constructor(private readonly attemptService: AttemptService) {}

  @Cron(ATTEMPT_EXPIRY_CRON)
  async handleCron(): Promise<void> {
    const finalized = await this.attemptService.finalizeExpiredInProgress();
    this.logger.log(`Finalized ${finalized} expired attempt(s)`);
  }
}
