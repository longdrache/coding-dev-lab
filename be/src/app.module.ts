import { Module } from '@nestjs/common';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { Judge0Controller } from './judge0.controller.ts';
import { Judge0Service } from './judge0.service.ts';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { PremiumController } from './premium.controller.ts';
import { PremiumService } from './premium.service.ts';

@Module({
  imports: [],
  controllers: [AppController, Judge0Controller, PremiumController],
  providers: [
    AppService,
    Judge0Service,
    ClerkAuthGuard,
    RolesGuard,
    PremiumService,
  ],
})
export class AppModule {}
