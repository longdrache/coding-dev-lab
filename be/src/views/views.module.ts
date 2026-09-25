import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { ViewsController } from './views.controller.ts';
import { ViewsService } from './views.service.ts';

@Module({
  imports: [DatabaseModule],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [ViewsService],
})
export class ViewsModule {}
