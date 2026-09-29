import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState, consumeState, safeInternalPath } from './oauth-state.ts';

/**
 * db giả của `UserOAuthState`. `consumeState` **xoá hẳn** dòng nên `update` biến
 * mất khỏi khuôn này: còn `update` thì db giả vẫn chạy được trong khi code thật
 * đã đổi sang `deleteMany`, và mọi test "state dùng một lần rồi chết" sẽ xanh vì
 * lý do hoàn toàn khác với cái đang kiểm.
 *
 * `deleteMany` lọc đúng ba điều kiện mà service dùng (`stateHash`, `usedAt: null`,
 * `expiresAt > now`) và **xoá thật khỏi mảng** — không xoá thì `findUnique` ở
 * lần `consumeState` sau vẫn thấy dòng cũ và test "dùng một lần rồi chết" xanh
 * oan. `usedAt` phải dựng sẵn `null` như schema: so `undefined === null` là false
 * sẽ khiến mọi dòng bị lọc ra.
 */
function makeDb() {
  const state: Record<string, any> = { oauth: [] };
  const rows = () => state.oauth;
  return {
    state,
    userOAuthState: {
      create: vi.fn(async ({ data }: any) => {
        const r = { usedAt: null, ...data };
        rows().push(r);
        return r;
      }),
      findUnique: vi.fn(async ({ where }: any) =>
        rows().find((r: any) => r.stateHash === where?.stateHash) ?? null),
      // Chỉ lọc theo điều kiện `where` **thực sự có mặt**, y hệt Prisma. Không lọc
      // `usedAt` khi `where` không nói tới nó: db giả nghiêm hơn DB thật thì nó
      // giấu lỗi — bỏ `usedAt: null` khỏi câu `DELETE` của `consumeState` sẽ không
      // bao giờ làm test nào đỏ, dù ở DB thật dòng `usedAt` cũ bị xoá oan.
      deleteMany: vi.fn(async ({ where }: any) => {
        const con = rows().filter((r: any) => {
          if (r.stateHash !== where?.stateHash) return false;
          if (where?.usedAt !== undefined && r.usedAt !== where.usedAt) return false;
          if (where?.expiresAt?.gt !== undefined && r.expiresAt.getTime() <= where.expiresAt.gt.getTime()) {
            return false;
          }
          if (where?.expiresAt?.lte !== undefined && r.expiresAt.getTime() > where.expiresAt.lte.getTime()) {
            return false;
          }
          return true;
        });
        state.oauth = state.oauth.filter((r: any) => !con.includes(r));
        return { count: con.length };
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

  it('dùng xong thì dòng bị XOÁ HẲN, không còn trong bảng', async () => {
    // Bảng này phình theo **số lần bấm nút** chứ không theo số người: nếu chỉ
    // đánh dấu `usedAt` thì mọi dòng đã dùng nằm lại vĩnh viễn cùng
    // `codeVerifier` dạng rõ. Sửa `deleteMany` thành `update` là test này đỏ.
    const db = makeDb();
    const { state } = await createState(db, '/');
    expect(db.state.oauth).toHaveLength(1);
    expect(await consumeState(db, state)).not.toBeNull();
    expect(db.state.oauth).toHaveLength(0);
  });

  it('state hết hạn thì trả null và để dòng cho lịch dọn theo hạn', async () => {
    // Cố ý KHÔNG xoá ở đây: điều kiện `expiresAt: { gt: now }` nằm trong chính
    // câu `DELETE` để chốt chặn nguyên tử, nên dòng hết hạn không khớp và được
    // trả lại cho lịch dọn (`AuthService` xoá theo `expiresAt`, có index riêng).
    // Nếu muốn `consumeState` tự xoá luôn dòng hết hạn thì phải thêm một câu
    // `DELETE` thứ hai — tức quay lại đúng chỗ "đọc-rồi-ghi" mà VIỆC 3 vá.
    const db = makeDb();
    const { state } = await createState(db, '/', new Date(Date.now() - 11 * 60 * 1000));
    expect(await consumeState(db, state)).toBeNull();
    expect(db.state.oauth).toHaveLength(1);
  });

  it('điều kiện xoá lọc cả usedAt lẫn expiresAt, để chốt chặn nằm trong SQL', async () => {
    // `SELECT` rồi mới `UPDATE` là cách cũ: hai callback song song đều đọc được
    // `usedAt = null` và cả hai đều đi tiếp, tức state dùng được hai lần đúng lúc
    // nó còn hạn. Test này chốt rằng điều kiện nằm **trong** câu `DELETE`, chứ
    // không nằm ở `if` phía trên. Bỏ `expiresAt` khỏi điều kiện là đỏ.
    const db = makeDb();
    const { state } = await createState(db, '/');
    const now = new Date();
    await consumeState(db, state, now);
    expect(db.userOAuthState.deleteMany).toHaveBeenCalledWith({
      where: { stateHash: expect.any(String), usedAt: null, expiresAt: { gt: now } },
    });
  });

  it('hai callback cùng state: chỉ một cái thắng, cái còn lại trả null', async () => {
    // `deleteMany` của db giả xoá đồng bộ trước khi `await`, nên hai lệnh chạy
    // song song vẫn phải có đúng một `count = 1` — đúng như `DELETE` thật của
    // Postgres, nơi chỉ một giao dịch xoá được dòng đó.
    const db = makeDb();
    const { state } = await createState(db, '/premium');
    const [a, b] = await Promise.all([consumeState(db, state), consumeState(db, state)]);
    expect([a, b].filter((r) => r !== null)).toHaveLength(1);
    expect(db.state.oauth).toHaveLength(0);
  });

  it('dòng đã đánh dấu usedAt từ bản deploy cũ thì vẫn bị từ chối', async () => {
    // Bản cũ đánh dấu `usedAt` thay vì xoá, nên trong DB còn dòng đã dùng mà
    // state vẫn còn hạn. `usedAt: null` trong điều kiện lọc là để những dòng đó
    // bị từ chối y hệt dòng đã bị xoá. Bỏ `usedAt` khỏi điều kiện là test này đỏ.
    const db = makeDb();
    const { state } = await createState(db, '/');
    db.state.oauth[0].usedAt = new Date();
    expect(await consumeState(db, state)).toBeNull();
  });
});

afterEach(() => vi.useRealTimers());
