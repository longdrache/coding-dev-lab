import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppController } from './app.controller.ts';

describe('AppController health', () => {
  it('DB sống → 200 { status ok, uptime, db up }', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const c = new AppController(db as never);
    const body = await c.getHealth();
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(body.uptimeSeconds).toEqual(expect.any(Number));
  });

  it('DB chết → 503 để monitor báo động thay vì tưởng ổn', async () => {
    const db = { $queryRaw: vi.fn().mockRejectedValue(new Error('conn refused')) };
    const c = new AppController(db as never);
    await expect(c.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
