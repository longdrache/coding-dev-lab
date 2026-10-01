import { describe, expect, it, afterEach } from 'vitest';
import { Controller, Get } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { Throttle, ThrottleGuard, DEFAULT_THROTTLE } from './throttle.guard.ts';

/**
 * Bằng chứng cho việc gỡ `express-rate-limit`: tầng giới hạn duy nhất còn lại là
 * `ThrottleGuard`, và nó phải phủ **mọi** route chứ không chỉ 17 route gắn
 * `@Throttle`.
 *
 * Vì sao mọi test ở đây dựng Nest app thật + HTTP thật thay vì gọi
 * `guard.canActivate()` trực tiếp: lỗi nguy hiểm nhất của đợt gỡ này là **đếm
 * hai lần**. Nếu `ThrottleGuard` vừa được đăng ký `APP_GUARD` vừa còn
 * `@UseGuards(ThrottleGuard)` trên route, Nest chạy nó **hai lần mỗi request**,
 * nên `register` 20/giờ âm thầm thành 10/giờ. Chỉ tầng HTTP mới nhìn thấy hiện
 * tượng đó — gọi `canActivate()` trực tiếp thì guard nào cũng chỉ chạy đúng một
 * lần nên test sẽ xanh trong khi sản phẩm thì hỏng.
 */

// Tên class khác nhau là bắt buộc: `buckets` trong `throttle.guard.ts` là
// module-level, khoá theo `${ip}:${ClassName}:${handlerName}`.
@Controller('tl20')
class CtlLimit20 {
  @Get('submit')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  submit() {
    return { ok: true };
  }
}

@Controller('tl5')
class CtlLimit5 {
  @Get('submit')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit() {
    return { ok: true };
  }
}

// Route KHÔNG có `@Throttle`: sau khi gỡ `express-rate-limit` thì chỉ còn ngưỡng
// mặc định của guard bảo vệ. Không có controller nào trong `src/` giống hệt hình
// dạng này thật — nó đại diện cho 51 route không gắn `@Throttle`.
@Controller('topen')
class CtlOpen {
  @Get('plain')
  plain() {
    return { ok: true };
  }
}

const CONTROLLERS = [CtlLimit20, CtlLimit5, CtlOpen];

type Restorer = () => void;

/**
 * Dựng app với `ThrottleGuard` đăng ký đúng một lần ở tầng `APP_GUARD` — đúng
 * như `app.module.ts` sau khi đổi. `DISABLE_RATE_LIMIT` được set/tháo **ở đây**
 * chứ không đọc từ `.env` hay từ môi trường của máy: nếu khai test dựa vào biến
 * có sẵn thì local xanh còn CI đỏ (bài học `f4d04c4`).
 *
 * `trust proxy` bật để mỗi test dùng một `X-Forwarded-For` khác nhau. Không có
 * nó thì mọi request của supertest đều mang `req.ip = 127.0.0.1` và **dùng
 * chung một bucket** — bộ đếm của test trước sẽ làm test sau đỏ. Bật `trust
 * proxy` rồi đổi IP mới tách được bucket, và cách này cũng đúng thứ guard dùng
 * thật (`req.ip` sau khi Express đã tính lại từ chuỗi proxy).
 */
async function boot(disable: boolean): Promise<{ app: INestApplication; restore: Restorer }> {
  const prev = process.env.DISABLE_RATE_LIMIT;
  if (disable) process.env.DISABLE_RATE_LIMIT = '1';
  else delete process.env.DISABLE_RATE_LIMIT;

  const ref = await Test.createTestingModule({
    controllers: CONTROLLERS,
    providers: [{ provide: APP_GUARD, useClass: ThrottleGuard }],
  }).compile();
  const app = ref.createNestApplication();
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  await app.init();

  return {
    app,
    restore: () => {
      if (prev === undefined) delete process.env.DISABLE_RATE_LIMIT;
      else process.env.DISABLE_RATE_LIMIT = prev;
    },
  };
}

/** Bắn `n` request GET từ IP `ip`, trả về mảng status để assert chính xác chỗ bị chặn. */
async function fire(
  app: INestApplication,
  path: string,
  n: number,
  ip: string,
): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push((await request(app.getHttpServer()).get(path).set('X-Forwarded-For', ip)).status);
  }
  return out;
}

/** Chỉ số (0-based) của request đầu tiên bị 429, hoặc -1. */
function first429(statuses: number[]): number {
  return statuses.findIndex((s) => s === 429);
}

let open: INestApplication | null = null;
let restoreEnv: Restorer | null = null;

async function start(disable = false) {
  const r = await boot(disable);
  open = r.app;
  restoreEnv = r.restore;
}

afterEach(async () => {
  if (open) await open.close();
  open = null;
  restoreEnv?.();
  restoreEnv = null;
});

describe('ngưỡng mặc định của ThrottleGuard thay cho express-rate-limit', () => {
  it('ngưỡng mặc định là 100/phút — bằng đúng mức express đang đặt', () => {
    expect(DEFAULT_THROTTLE).toEqual({ limit: 100, ttl: 60_000 });
  });

  it('route KHÔNG có @Throttle cho phép đúng 100 lần, lần 101 thì 429', async () => {
    await start();
    const s = await fire(open!, '/topen/plain', 101, '10.1.0.1');
    expect(s[0]).toBe(200);
    expect(s[99]).toBe(200);
    expect(s[100]).toBe(429);
    expect(first429(s)).toBe(100);
  });

  it('route CÓ @Throttle(20) cho phép đúng 20 lần — KHÔNG đếm hai lần thành 10', async () => {
    await start();
    const s = await fire(open!, '/tl20/submit', 21, '10.1.0.2');
    // Nếu guard chạy 2 lần/request thì #11 đã 429 và `s[19]` không phải 200.
    expect(s[9]).toBe(200);
    expect(s[19]).toBe(200);
    expect(s[20]).toBe(429);
    expect(first429(s)).toBe(20);
  });

  it('route CÓ @Throttle(5) cho phép đúng 5 lần — ngưỡng nhỏ không bị chia đôi', async () => {
    await start();
    const s = await fire(open!, '/tl5/submit', 6, '10.1.0.3');
    expect(s[4]).toBe(200);
    expect(s[5]).toBe(429);
    expect(first429(s)).toBe(5);
  });

  it('đếm ngược từ ngưỡng: 19 lần thì không chặn, 20 lần thì chặn', async () => {
    // Biên này là thứ duy nhất phân biệt "mỗi request đếm một lần" với "mỗi
    // request đếm hai lần" ở **mọi** ngưỡng, kể cả ngưỡng lẻ.
    await start();
    const under = await fire(open!, '/tl20/submit', 19, '10.1.0.4');
    expect(under.some((s) => s === 429)).toBe(false);
    await open!.close();
    open = null;
    restoreEnv?.();
    restoreEnv = null;
    await start();
    const over = await fire(open!, '/tl20/submit', 20, '10.1.0.4');
    expect(over[19]).toBe(429);
  });

  it('ngưỡng tính riêng theo từng route, không gộp chung', async () => {
    // Nếu các route dùng chung một bucket thì 100 lần ở route không giới hạn
    // sẽ làm route giới hạn 5 chết ngay ở nhịp thứ 6.
    await start();
    await fire(open!, '/topen/plain', 100, '10.1.0.5');
    const s = await fire(open!, '/tl5/submit', 6, '10.1.0.5');
    expect(s[4]).toBe(200);
    expect(s[5]).toBe(429);
  });

  it('IP khác thì không dùng chung bộ đếm', async () => {
    await start();
    const het = await fire(open!, '/tl5/submit', 6, '10.1.0.6');
    expect(het[5]).toBe(429);
    const other = await fire(open!, '/tl5/submit', 5, '10.1.0.7');
    expect(other.every((s) => s === 200)).toBe(true);
  });
});

describe('kill switch DISABLE_RATE_LIMIT', () => {
  it('tắt cả ngưỡng mặc định lẫn @Throttle — không còn 429 nào', async () => {
    await start(true);
    const openS = await fire(open!, '/topen/plain', 150, '10.2.0.1');
    expect(openS.every((s) => s === 200)).toBe(true);

    const limited = await fire(open!, '/tl5/submit', 60, '10.2.0.1');
    expect(limited.every((s) => s === 200)).toBe(true);
  });

  it('bật lại thì ngưỡng có hiệu lực — không phải cờ bị nuốt vĩnh viễn', async () => {
    await start(true);
    await fire(open!, '/tl5/submit', 60, '10.2.0.2');
    await open!.close();
    open = null;
    restoreEnv?.();
    restoreEnv = null;

    await start(false);
    const s = await fire(open!, '/tl5/submit', 6, '10.2.0.2');
    expect(s[5]).toBe(429);
  });
});

/** Đọc đệ quy mọi file `.ts` trong `be/src`, bỏ qua file test. */
function srcFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) srcFiles(p, acc);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) acc.push(p);
  }
  return acc;
}

const BE_ROOT = process.cwd();

/** Bỏ dòng chú thích, chỉ để lại code — để quét decorator khỏi bị ghi chú âm thầm. */
function codeLines(src: string): string {
  return src
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
    .join('\n');
}

describe('không còn đếm hai lần ở tầng khai báo', () => {
  it('không file nào trong src/ còn @UseGuards(...ThrottleGuard...)', () => {
    // Đây là cái bẫy của đợt đổi này: đăng ký `APP_GUARD` mà quên gỡ
    // `@UseGuards(ThrottleGuard)` thì guard chạy 2 lần mỗi request. Test HTTP ở
    // trên bắt được hậu quả; test này bắt được **nguyên nhân**, và vẫn đỏ nếu ai
    // đó thêm lại decorator ở một route mới.
    const offenders = srcFiles(join(BE_ROOT, 'src')).filter((f) =>
      /@UseGuards\([^)]*ThrottleGuard/.test(codeLines(readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('app.module.ts không còn nhập hay gọi express-rate-limit', () => {
    const code = codeLines(readFileSync(join(BE_ROOT, 'src', 'app.module.ts'), 'utf8'));
    expect(code).not.toMatch(/express-rate-limit/);
    expect(code).not.toMatch(/rateLimit\(/);
  });

  it('app.module.ts đăng ký ThrottleGuard đúng một lần ở tầng APP_GUARD', () => {
    const code = codeLines(readFileSync(join(BE_ROOT, 'src', 'app.module.ts'), 'utf8'));
    const registrations = code.match(/provide:\s*APP_GUARD,\s*useClass:\s*ThrottleGuard/g) ?? [];
    expect(registrations).toHaveLength(1);
  });

  it('package.json không còn express-rate-limit (kể cả @types)', () => {
    const pkg = JSON.parse(readFileSync(join(BE_ROOT, 'package.json'), 'utf8'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(all).filter((k) => k.includes('rate-limit'))).toEqual([]);
  });

  it('không route nào khai ngưỡng cao hơn trần 100/phút của tầng cũ', () => {
    // Hai route từng khai 120/phút (`auth.refresh`, `judge0.batch`) là **code
    // chết**: `express-rate-limit` chặn ở 100 cho *mọi* route nên 120 không bao
    // giờ có tác dụng. Khi tầng đó biến mất, khai 120 sẽ thành số thật và **nới**
    // ngưỡng so với hành vi đang chạy — nên đã hạ về 100.
    //
    // So sánh bằng **số** chứ không bằng regex: regex kiểu `1[0-9]{2}` cũng ăn
    // trúng chính số 100 và báo động giả.
    const tooHigh = srcFiles(join(BE_ROOT, 'src')).flatMap((f) => {
      const src = readFileSync(f, 'utf8');
      return [...src.matchAll(/@Throttle\(\{\s*default:\s*\{\s*limit:\s*(\d+)/g)]
        .filter((m) => Number(m[1]) > 100)
        .map((m) => `${f}: limit=${m[1]}`);
    });
    expect(tooHigh).toEqual([]);
  });

  it('đã hạ hai route từng khai 120/phút xuống 100/phút', () => {
    // Ghim rõ mốc đã nói ở trên để thay đổi ngưỡng ở đây phải có chủ đích.
    const re = /limit:\s*100,\s*ttl:\s*60 \* 1000\s*\}\s*\}\s*\)\s*$/m;
    const refresh = readFileSync(join(BE_ROOT, 'src', 'auth', 'auth.controller.ts'), 'utf8');
    const batch = readFileSync(join(BE_ROOT, 'src', 'judge0', 'judge0.controller.ts'), 'utf8');
    expect(refresh).toMatch(re);
    expect(batch).toMatch(/limit:\s*100,\s*ttl:\s*60_000\s*\}\s*\}\s*\)\s*$/m);
  });
});