import { Module, NestModule } from '@nestjs/common';
import rateLimit from 'express-rate-limit';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { Judge0Controller } from './judge0.controller.ts';
import { Judge0Service } from './judge0.service.ts';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { PremiumController } from './premium.controller.ts';
import { PremiumService } from './premium.service.ts';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.ts';
import { PresenceModule } from './presence/presence.module.ts';
import { ActivityModule } from './activity/activity.module.ts';
import { ProgressModule } from './progress/progress.module.ts';
import { ProblemsModule } from './problems/problems.module.ts';
import { SubmissionsModule } from './submissions/submissions.module.ts';
import { QnaModule } from './qna/qna.module.ts';
import { AdminModule } from './admin/admin.module.ts';

const rateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 1 phút',
  standardHeaders: true,
  legacyHeaders: false,
});

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    DatabaseModule,
    AdminModule,
    PresenceModule,
    ActivityModule,
    ProgressModule,
    ProblemsModule,
    SubmissionsModule,
    QnaModule,
  ],
  controllers: [AppController, Judge0Controller, PremiumController],
  providers: [
    AppService,
    Judge0Service,
    ClerkAuthGuard,
    RolesGuard,
    PremiumService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: any) {
    consumer.apply(rateLimiter).forRoutes('*');
  }
}
