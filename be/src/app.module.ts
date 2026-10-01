import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { ThrottleGuard } from './common/throttle.guard.ts';

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
    // Tầng giới hạn tần suất duy nhất, thay cho `express-rate-limit` đã gỡ.
    //
    // Phải đăng ký ở tầng `APP_GUARD` chứ không gắn `@UseGuards` rải rác: (1) để
    // ngưỡng mặc định 100/phút phủ được cả những route không gắn `@Throttle` —
    // trước đó chúng chỉ được bảo vệ bởi middleware; (2) vì guard toàn cục luôn
    // chạy **trước** guard của route. Nếu vừa đăng ký ở đây vừa còn
    // `@UseGuards(ThrottleGuard)` trên route thì Nest chạy nó hai lần mỗi request
    // và mọi ngưỡng bị chia đôi (20/giờ -> 10/giờ). Vì vậy decorator
    // `@UseGuards(ThrottleGuard)` đã bị gỡ khỏi toàn bộ controller.
    { provide: APP_GUARD, useClass: ThrottleGuard },
  ],
})
export class AppModule {}
