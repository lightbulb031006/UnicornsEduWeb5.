import { Module } from '@nestjs/common';
import { QuestionController } from './question.controller';
import { QuestionService } from './question.service';
import { SharedMaterialController } from './shared-material.controller';
import { AudioAssetController } from './audio-asset.controller';
import { AudioAssetService } from './audio-asset.service';
import { QuestionImageController } from './question-image.controller';
import { QuestionImageService } from './question-image.service';
import { SharedMaterialService } from './shared-material.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ActionHistoryModule } from '../action-history/action-history.module';
import { ClassModule } from '../class/class.module';

@Module({
  imports: [PrismaModule, ActionHistoryModule, ClassModule],
  controllers: [
    QuestionController,
    SharedMaterialController,
    AudioAssetController,
    QuestionImageController,
  ],
  providers: [
    QuestionService,
    SharedMaterialService,
    AudioAssetService,
    QuestionImageService,
  ],
  exports: [QuestionService],
})
export class QuestionModule {}
