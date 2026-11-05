import { Global, Module } from '@nestjs/common';
import { LmsProfileController } from './lms-profile.controller';
import { LmsProfileService } from './lms-profile.service';

@Global()
@Module({
  controllers: [LmsProfileController],
  providers: [LmsProfileService],
  exports: [LmsProfileService],
})
export class LmsProfileModule {}
