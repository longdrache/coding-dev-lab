import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { Judge0Controller } from './judge0.controller.js';
import { Judge0Service } from './judge0.service.js';

@Module({
  imports: [],
  controllers: [AppController, Judge0Controller],
  providers: [AppService, Judge0Service],
})
export class AppModule {}
