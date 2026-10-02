import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StudentGalleryController } from './student-gallery.controller';
import { StudentGalleryService } from './student-gallery.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StudentGalleryController],
  providers: [StudentGalleryService],
  exports: [StudentGalleryService],
})
export class StudentGalleryModule {}
