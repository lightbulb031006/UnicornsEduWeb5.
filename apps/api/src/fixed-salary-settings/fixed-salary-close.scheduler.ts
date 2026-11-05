import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { VIETNAM_TIME_ZONE } from './current-month.util';
import { FixedSalaryCloseService } from './fixed-salary-close.service';

@Injectable()
export class FixedSalaryCloseScheduler {
  private readonly logger = new Logger(FixedSalaryCloseScheduler.name);

  constructor(private readonly fixedSalaryCloseService: FixedSalaryCloseService) {}

  @Cron('0 1 28 * *', {
    name: 'close-monthly-fixed-salary',
    timeZone: VIETNAM_TIME_ZONE,
  })
  async handleMonthlyClose() {
    this.logger.log(
      'Starting automatic monthly fixed-salary close for the current Vietnam month',
    );

    try {
      // Chốt nốt mọi nhân sự chưa chốt / chốt dở; khoản đã chốt tay giữ nguyên.
      const result = await this.fixedSalaryCloseService.closeCurrentMonth();
      this.logger.log(
        `Closed ${result.month}: created=${result.createdCount} skipped=${result.skippedCount}`,
      );
    } catch (error) {
      this.logger.error('Automatic monthly fixed-salary close failed', error);
    }
  }
}
