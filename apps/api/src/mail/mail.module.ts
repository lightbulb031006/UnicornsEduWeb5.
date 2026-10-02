import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { ReceiptAssetsService } from './receipt-assets.service';
import { ReceiptPdfService } from './receipt-pdf.service';

@Module({
  imports: [ConfigModule],
  providers: [MailService, ReceiptPdfService, ReceiptAssetsService],
  exports: [MailService, ReceiptPdfService],
})
export class MailModule {}
