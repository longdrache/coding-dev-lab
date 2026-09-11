import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { Judge0Controller } from './judge0.controller.js';
import { Judge0Service } from './judge0.service.js';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController, Judge0Controller],
  providers: [AppService, Judge0Service, ClerkAuthGuard, RolesGuard],
})
export class AppModule {}
