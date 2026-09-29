import { Module, NestModule } from '@nestjs/common';
import rateLimit from 'express-rate-limit';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { AuthModule } from './auth/auth.module.ts';
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
  message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
  standardHeaders: true,
  legacyHeaders: false,
});

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    DatabaseModule,
    AuthModule,
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
    RolesGuard,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: any) {
    // Tắt limiter toàn cục. Chỉ dùng cho test e2e: cả suite bắn hàng trăm
    // request trong vài giây từ **cùng một IP** (127.0.0.1), nên ngưỡng
    // 100/phút sẽ chặn chính test của ta và mọi assert về mã lỗi bài VIP sẽ đỏ
    // vì nhầm là 429 — tức test không còn kiểm tra cái nó tên.
    // `vitest.config.e2e.ts` bật cờ này; ở mọi nơi khác cờ vắng mặt thì hành vi
    // y hệt trước đây.
    if (process.env.DISABLE_RATE_LIMIT === '1') return;
    consumer.apply(rateLimiter).forRoutes('*');
  }
}
