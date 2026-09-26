import { Module, NestModule } from '@nestjs/common';
import rateLimit from 'express-rate-limit';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.ts';
import { PresenceModule } from './presence/presence.module.ts';
import { ActivityModule } from './activity/activity.module.ts';
import { ProgressModule } from './progress/progress.module.ts';
import { ProblemsModule } from './problems/problems.module.ts';
import { SubmissionsModule } from './submissions/submissions.module.ts';
import { ViewsModule } from './views/views.module.ts';
import { QnaModule } from './qna/qna.module.ts';
import { AdminModule } from './admin/admin.module.ts';
import { Judge0Module } from './judge0/judge0.module.ts';
import { PremiumModule } from './premium/premium.module.ts';

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
    ViewsModule,
    QnaModule,
    Judge0Module,
    PremiumModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ClerkAuthGuard,
    RolesGuard,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: any) {
    consumer.apply(rateLimiter).forRoutes('*');
  }
}
