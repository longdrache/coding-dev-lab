// TEMPORARY DIAGNOSTIC PROBE — not for commit. Deleted after evidence is collected.
// Reproduces the exact production layering (real ThrottleGuard + real express-rate-limit
// config from app.module.ts) to determine WHICH layer emits 429 first, and at what count.
import { describe, expect, it } from 'vitest';
import {
  Controller,
  Get,
  Module,
  NestModule,
  UseGuards,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { Throttle, ThrottleGuard } from '../src/common/throttle.guard.ts';

// Distinct class names because `buckets` in throttle.guard.ts is module-level and
// keyed by `${ip}:${ClassName}:${handlerName}`.
@Controller('c120')
class Ctl120 {
  @Get('limited')
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  limited() {
    return { ok: true };
  }
}

@Controller('c5')
class Ctl5 {
  @Get('limited')
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  limited() {
    return { ok: true };
  }
}

// No @Throttle metadata: mirrors the many un-throttled GET routes.
@Controller('copen')
class CtlOpen {
  @Get('limited')
  @UseGuards(ThrottleGuard)
  limited() {
    return { ok: true };
  }
}

const EXPRESS_429 = 'EXPRESS_LAYER_429';

function makeModule(ctrl: unknown, disable: boolean) {
  class ProbeModule implements NestModule {
    configure(consumer: any) {
      if (disable) return;
      consumer
        .apply(
          rateLimit({
            windowMs: 60_000,
            limit: 100,
            message: EXPRESS_429,
            standardHeaders: true,
            legacyHeaders: false,
          }),
        )
        .forRoutes('*');
    }
  }
  Module({ controllers: [ctrl], providers: [ThrottleGuard] })(ProbeModule);
  return ProbeModule;
}

async function firstBlock(
  ctrl: unknown,
  disable: boolean,
  path: string,
  max: number,
) {
  const Mod = makeModule(ctrl, disable);
  const app = await NestFactory.create<NestExpressApplication>(Mod, { logger: false });
  await app.init();
  const server = app.getHttpServer();
  const out: { n: number; status: number; body: string }[] = [];
  for (let n = 1; n <= max; n++) {
    const res = await request(server).get(path);
    out.push({
      n,
      status: res.status,
      body: typeof res.body === 'object' ? JSON.stringify(res.body) : String(res.text),
    });
    if (res.status === 429) break;
  }
  await app.close();
  return out;
}

const GUARD_MSG = 'Quá nhiều yêu cầu';

function classify(r: { n: number; status: number; body: string }) {
  if (r.status !== 429) return `no-429 (ok through #${r.n})`;
  return r.body.includes(EXPRESS_429) ? 'EXPRESS layer' : 'GUARD layer';
}

describe('PROBE: which rate-limit layer wins', () => {
  it('A) @Throttle 120/min vs express 100/min -> which fires first?', async () => {
    const r = await firstBlock(Ctl120, false, '/c120/limited', 130);
    const hit = r.find((x) => x.status === 429)!;
    console.log('A) first 429 at #' + hit.n + ' from', classify(hit));
    expect(hit).toBeTruthy();
  });

  it('B) @Throttle 5/min vs express 100/min -> which fires first?', async () => {
    const r = await firstBlock(Ctl5, false, '/c5/limited', 130);
    const hit = r.find((x) => x.status === 429)!;
    console.log('B) first 429 at #' + hit.n + ' from', classify(hit));
    expect(hit).toBeTruthy();
  });

  it('C) no @Throttle + express enabled -> is there any limit?', async () => {
    const r = await firstBlock(CtlOpen, false, '/copen/limited', 130);
    const hit = r.find((x) => x.status === 429)!;
    console.log('C) first 429 at #' + (hit ? hit.n : 'none') + ' from', hit ? classify(hit) : 'none');
    expect(hit).toBeTruthy();
  });

  it('D) DISABLE_RATE_LIMIT=1 + @Throttle 5/min -> is the guard still active?', async () => {
    const r = await firstBlock(Ctl5, true, '/c5/limited', 20);
    const hit = r.find((x) => x.status === 429)!;
    console.log('D) first 429 at #' + (hit ? hit.n : 'none') + ' from', hit ? classify(hit) : 'none');
    expect(hit).toBeTruthy();
  });

  it('E) DISABLE_RATE_LIMIT=1 + no @Throttle -> anything left?', async () => {
    const r = await firstBlock(CtlOpen, true, '/copen/limited', 130);
    const hit = r.find((x) => x.status === 429)!;
    console.log('E) first 429 at #' + (hit ? hit.n : 'none') + ' from', hit ? classify(hit) : 'none');
    expect(hit).toBeFalsy();
  });
});
