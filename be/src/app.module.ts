import { Module } from '@nestjs/common';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { Judge0Controller } from './judge0.controller.ts';
import { Judge0Service } from './judge0.service.ts';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { PremiumController } from './premium.controller.ts';
import { PremiumService } from './premium.service.ts';
import { ConfigModule } from '@nestjs/config';
import { EmailController } from './email.controller.ts';
import { EmailService } from './email.service.ts';
import { EmployeesModule } from './employees/employees.module.js';
import { PresenceModule } from './presence/presence.module.ts';
import { ActivityModule } from './activity/activity.module.ts';
import { ProgressModule } from './progress/progress.module.ts';
import { ProblemsModule } from './problems/problems.module.ts';
import { SubmissionsModule } from './submissions/submissions.module.ts';
import { QnaModule } from './qna/qna.module.ts';
@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    EmployeesModule,
    PresenceModule,
    ActivityModule,
    ProgressModule,
    ProblemsModule,
    SubmissionsModule,
    QnaModule,
  ],
  controllers: [
    AppController,
    Judge0Controller,
    PremiumController,
    EmailController,
  ],
  providers: [
    AppService,
    Judge0Service,
    ClerkAuthGuard,
    RolesGuard,
    PremiumService,
    EmailService,
  ],
})
export class AppModule {}
