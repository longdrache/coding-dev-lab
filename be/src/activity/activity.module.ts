import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { ActivityService } from './activity.service.ts';
import { ActivityController } from './activity.controller.ts';

@Module({
  imports: [DatabaseModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
