import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
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
import { DEFAULT_CACHE_TTL_MS, cacheStoreTtl } from './common/cache.config.ts';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    /**
     * Cache **nội dung** (bài toán, dashboard) của `@nestjs/cache-manager`.
     *
     * `isGlobal` vì `ProblemsService` và `ProgressService` ở hai module khác
     * nhau đều cần cùng một `CACHE_MANAGER`; khai báo global ở đây thì không phải
     * import lại `CacheModule` ở từng module — và quan trọng hơn: **cùng một
     * instance**, nên test và service luôn thấy đúng một kho cache.
     *
     * `ttl` ở đây chỉ là **lưới an toàn** cho key nào quên truyền TTL riêng, xem
     * lý do chọn `DEFAULT_CACHE_TTL_MS` trong `common/cache.config.ts`. TTL thật
     * của từng cache vẫn truyền tường minh ở lệnh `cache.set` của service.
     *
     * Store mặc định của cache-manager v6+ là in-memory theo **instance** — cùng
     * giới hạn mà `TtlCache` từng có, nên hit rate trên production **không đổi**
     * sau lần đổi này. Đổi sang store dùng chung (Vercel KV/Redis) là việc riêng,
     * cần quyết định chi phí; xem `docs/`/báo cáo đề xuất.
     */
CacheModule.register({
      isGlobal: true,
      ttl: cacheStoreTtl(DEFAULT_CACHE_TTL_MS),
    }),
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
