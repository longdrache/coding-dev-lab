import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.ts';
import { AuthModule } from './auth.module.ts';
import { AuthMailer } from './auth.mailer.ts';
import { AuthService, AuthMailPort } from './auth.service.ts';
import { AuthGuard } from './auth.guard.ts';
import { DatabaseService } from '../database/database.service.ts';

/**
 * `compile()` giải dependency thật — đó là lúc Nest ném
 * `TypeError: metatype is not a constructor` nếu `AuthMailPort` là `type` chứ không
 * phải class — nhưng **không** chạy lifecycle hook, nên
 * `DatabaseService.onModuleInit` (thứ mở connection Neon) không được gọi. Thêm
 * `overrideProvider` để chắc chắn không có connection nào ra ngoài khi `pnpm test`.
 *
 * `tsc` không bắt được lỗi DI: đó là lỗi runtime. Spec này là chốt chặn.
 */
async function compileAuth() {
  return Test.createTestingModule({ imports: [AuthModule] })
    .overrideProvider(DatabaseService)
    .useValue({})
    .compile();
}

describe('AuthModule', () => {
  it('AuthService resolve được — chứng minh AuthMailPort là token DI thật', async () => {
    const m = await compileAuth();
    expect(m.get(AuthService)).toBeInstanceOf(AuthService);
    await m.close();
  });

  it('cổng AuthMailPort trỏ tới đúng AuthMailer, và AuthService nhận chính instance đó', async () => {
    const m = await compileAuth();
    const mailer = m.get(AuthMailPort);
    expect(mailer).toBeInstanceOf(AuthMailer);
    // `AuthService` không hề import `AuthMailer`; chỉ khi mapping trong `auth.module.ts`
    // đúng thì tham số thứ hai mới là instance này.
    const { mail } = m.get(AuthService) as unknown as { mail: unknown };
    expect(mail).toBe(mailer);
    await m.close();
  });

  it('AuthGuard và AuthService được export cho module khác dùng ở Task 8', async () => {
    const m = await compileAuth();
    expect(m.get(AuthGuard)).toBeInstanceOf(AuthGuard);
    expect(m.get(AuthService)).toBeInstanceOf(AuthService);
    await m.close();
  });
});

/**
 * Xoá `AuthModule` khỏi `imports` của `app.module.ts` thì mọi test khác vẫn xanh
 * (chúng compile `AuthModule` trực tiếp) còn production trả 404 cho toàn bộ
 * `/api/auth`. `AuthModule` **không** tự đăng ký: `imports` của `AppModule` là chỗ
 * duy nhất nó được nối vào, nên phải có test riêng cho chỗ đó.
 */
describe('AuthModule được nối vào AppModule', () => {
  it('AppModule import AuthModule', () => {
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[] | undefined;
    expect(imports ?? []).toContain(AuthModule);
  });
});
