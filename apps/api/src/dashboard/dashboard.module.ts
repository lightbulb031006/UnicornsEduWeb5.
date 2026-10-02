import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DashboardCacheService } from '../cache/dashboard-cache.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ClassModule } from '../class/class.module';
import { MailModule } from '../mail/mail.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { FinancialExportExcelService } from './financial-export-excel.service';
import { FinancialExportPdfService } from './financial-export-pdf.service';
import { MonthlyStatisticsExportPdfService } from './monthly-statistics-export-pdf.service';

@Module({
  imports: [ConfigModule, PrismaModule, ClassModule, MailModule],
  controllers: [DashboardController],
  providers: [
    DashboardCacheService,
    DashboardService,
    FinancialExportPdfService,
    FinancialExportExcelService,
    MonthlyStatisticsExportPdfService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
