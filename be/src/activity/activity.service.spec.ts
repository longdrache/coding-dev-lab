import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityService } from './activity.service.ts';

function makeService(findFirst: unknown = null) {
  const db = {
    activityDay: { upsert: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    loginEvent: {
      findFirst: vi.fn().mockResolvedValue(findFirst),
      create: vi.fn().mockImplementation((args: unknown) => Promise.resolve(args)),
    },
  };
  return { svc: new ActivityService(db as any), db };
}

function boom(): never {
  throw new Error('network should not be called');
}

describe('ActivityService.recordLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ghi dòng mới cho user chưa có trong giờ', async () => {
    vi.stubGlobal('fetch', boom);
    const { svc, db } = makeService(null);
    await svc.recordLogin('u1');
    expect(db.loginEvent.create).toHaveBeenCalledOnce();
    const data = (db.loginEvent.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.clerkId).toBe('u1');
    expect(String(data.ipHash)).toHaveLength(64);
  });

  it('bỏ qua khi đã có dòng cùng quốc gia trong giờ', async () => {
    vi.stubGlobal('fetch', boom);
    const { svc, db } = makeService({ clerkId: 'u1', country: 'VN' });
    await svc.recordLogin('u1', { ip: '1.2.3.4', country: 'vn' });
    expect(db.loginEvent.create).not.toHaveBeenCalled();
  });

  it('vẫn ghi khi đổi quốc gia (VPN/du lịch)', async () => {
    vi.stubGlobal('fetch', boom);
    const { svc, db } = makeService({ clerkId: 'u1', country: 'VN' });
    await svc.recordLogin('u1', { ip: '9.9.9.9', country: 'us' });
    expect(db.loginEvent.create).toHaveBeenCalledOnce();
    const data = (db.loginEvent.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.country).toBe('US');
  });

  it('tra ip-api khi IP public mà thiếu country', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: 'success', countryCode: 'jp' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { svc, db } = makeService(null);
    await svc.recordLogin('u1', { ip: '8.8.8.8' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const data = (db.loginEvent.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.country).toBe('JP');
  });

  it('không tra IP private/localhost', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { svc, db } = makeService(null);
    await svc.recordLogin('u1', { ip: '127.0.0.1' });
    expect(fetchMock).not.toHaveBeenCalled();
    const data = (db.loginEvent.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.country).toBe('');
  });
});
