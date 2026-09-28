import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState, consumeState, safeInternalPath } from './oauth-state.ts';

function makeDb() {
  const state: Record<string, any> = { oauth: [] };
  return {
    state,
    userOAuthState: {
      create: vi.fn(async ({ data }: any) => {
        state.oauth.push(data);
        return data;
      }),
      findUnique: vi.fn(async ({ where }: any) =>
        state.oauth.find((r: any) => r.stateHash === where.stateHash) ?? null,
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const r = state.oauth.find((x: any) => x.stateHash === where.stateHash)!;
        Object.assign(r, data);
        return r;
      }),
    },
  } as any;
}

describe('safeInternalPath', () => {
  it('nhận đường dẫn nội bộ', () => {
    expect(safeInternalPath('/problem/two-sum')).toBe('/problem/two-sum');
    expect(safeInternalPath('  /premium  ')).toBe('/premium');
  });

  it('từ chối URL ngoài, protocol-relative và scheme lạ', () => {
    expect(safeInternalPath('https://evil.com')).toBe('/');
    expect(safeInternalPath('//evil.com')).toBe('/');
    expect(safeInternalPath('/\\evil.com')).toBe('/');
    expect(safeInternalPath('javascript:alert(1)')).toBe('/');
  });

  it('rỗng thì về trang chủ', () => {
    expect(safeInternalPath('')).toBe('/');
    expect(safeInternalPath(undefined as any)).toBe('/');
  });
});

describe('createState / consumeState', () => {
  it('state trả về dùng được một lần rồi chết', async () => {
    const db = makeDb();
    const { state } = await createState(db, '/problem');
    const first = await consumeState(db, state);
    expect(first).toEqual({ codeVerifier: expect.any(String), redirectTo: '/problem' });
    const second = await consumeState(db, state);
    expect(second).toBeNull();
  });

  it('lưu state dạng hash, không lưu bản rõ', async () => {
    const db = makeDb();
    const { state } = await createState(db, '/');
    const row = db.state.oauth[0];
    expect(row.stateHash).not.toBe(state);
    expect(row.stateHash).toHaveLength(64);
  });

  it('state hết hạn thì trả null, không ném', async () => {
    const db = makeDb();
    // Phải lùi quá TTL (10 phút) thì `expiresAt` mới nằm trong quá khứ.
    const { state } = await createState(db, '/', new Date(Date.now() - 11 * 60 * 1000));
    expect(await consumeState(db, state)).toBeNull();
  });

  it('state không tồn tại thì trả null', async () => {
    const db = makeDb();
    expect(await consumeState(db, 'khong-ton-tai')).toBeNull();
  });
});

afterEach(() => vi.useRealTimers());
