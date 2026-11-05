import { Injectable } from '@nestjs/common';
import { LmsProfileConfig, loadLmsProfile } from './lms-profile';

@Injectable()
export class LmsProfileService {
  readonly config: LmsProfileConfig = loadLmsProfile(process.env);

  get isIt(): boolean {
    return this.config.profile === 'it';
  }
}
