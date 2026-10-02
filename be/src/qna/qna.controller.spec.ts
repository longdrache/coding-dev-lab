import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { QnaController } from './qna.controller.ts';

/**
 * Hỏi đáp là endpoint **public** và nhận thân tùy ý từ trình duyệt, nên controller
 * phải tự bóp méo đầu vào thay vì tin bên dưới: cắt bớt độ dài, kiểm email, và
 * **không** ném khi không đăng nhập (khách vãng lai gửi câu hỏi không có token).
 *
 * Ba nhánh `catch {}` / `??` ở phần `userId` là chỗ dễ sai nhất: đọc `req.user`
 * khi nó chưa được `OptionalAuthGuard` gắn vào phải cho ra `null` chứ không phải
 * 500 — nếu không, mọi câu hỏi của khách vãng lai đều hỏng.
 */

function makeController() {
  const qna = {
    create: vi.fn().mockResolvedValue({ id: 42 }),
    findAll: vi.fn().mockResolvedValue([{ id: 42 }]),
  };
  return { ctrl: new QnaController(qna as never), qna };
}

/** `req` tối thiểu: controller chỉ đọc `headers.authorization` và tuỳ chọn `user`. */
function req(authorization?: string, user?: { userId?: unknown }) {
  return { headers: authorization ? { authorization } : {} , user } as never;
}

const HOP_LE = { name: 'An', email: 'an@example.com', question: 'Tai sao?' };

describe('POST /api/qna — chuẩn hoá đầu vào', () => {
  it('cắt khoảng trắng thừa ở đầu/cuối trước khi lưu', async () => {
    const { ctrl, qna } = makeController();
    await ctrl.create({ name: '  An  ', email: ' an@example.com ', question: ' Tai sao? ' }, req());
    expect(qna.create).toHaveBeenCalledWith({
      name: 'An',
      email: 'an@example.com',
      question: 'Tai sao?',
      userId: null,
    });
  });

  // Tên dài/câu hỏi dài đều là dữ liệu tùy ý — cắt để một người không nhét 5MB
  // vào cột `text`.
  it('cắt bớt tên và câu hỏi về đúng giới hạn cột', async () => {
    const { ctrl, qna } = makeController();
    await ctrl.create({ name: 'n'.repeat(300), email: 'an@example.com', question: 'q'.repeat(5000) }, req());
    expect(qna.create).toHaveBeenCalledWith({
      name: 'n'.repeat(100),
      email: 'an@example.com',
      question: 'q'.repeat(2000),
      userId: null,
    });
  });

  // Hành vi thật: email bị cắt **trước** rồi mới kiểm regex, nên email dài hơn 254
  // ký tự thành chuỗi không còn `@` và bị 400. Ghim lại đây để đổi thứ tự cắt/kiểm
  // sau này là một thay đổi có chủ đích, không phải tai nạn.
  it('email dài hơn 254 ký tự bị cắt mất phần đuôi rồi 400', async () => {
    const { ctrl, qna } = makeController();
    await expect(
      ctrl.create({ name: 'An', email: `${'e'.repeat(300)}@example.com`, question: 'q' }, req()),
    ).rejects.toThrow('Email không hợp lệ');
    expect(qna.create).not.toHaveBeenCalled();
  });

  it('thiếu tên/email/câu hỏi thì 400 và không ghi DB', async () => {
    const { ctrl, qna } = makeController();
    for (const body of [
      { email: 'an@example.com', question: 'q' },
      { name: 'An', question: 'q' },
      { name: 'An', email: 'an@example.com' },
    ]) {
      await expect(ctrl.create(body as never, req())).rejects.toThrow(
        'Thiếu tên, email hoặc câu hỏi',
      );
    }
    expect(qna.create).not.toHaveBeenCalled();
  });

  it('email sai định dạng thì 400, không ghi DB', async () => {
    const { ctrl, qna } = makeController();
    await expect(
      ctrl.create({ ...HOP_LE, email: 'an@' }, req()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(qna.create).not.toHaveBeenCalled();
  });

  // `message` là tên cũ mà FE cũ vẫn gửi: thiếu `question` thì lấy từ `message`,
  // bỏ thì mọi câu hỏi từ client cũ rơi vào nhánh 400.
  it('thiếu `question` thì lấy từ `message`', async () => {
    const { ctrl, qna } = makeController();
    await ctrl.create({ name: 'An', email: 'an@example.com', message: 'cau hoi' } as never, req());
    expect(qna.create).toHaveBeenCalledWith(expect.objectContaining({ question: 'cau hoi' }));
  });

  it('trả `{ ok, id }` lấy id từ service', async () => {
    const { ctrl } = makeController();
    expect(await ctrl.create(HOP_LE as never, req())).toEqual({ ok: true, id: 42 });
  });
});

describe('POST /api/qna — userId tuỳ chọn, thiếu token vẫn nhận câu hỏi', () => {
  it('không `Authorization` thì userId = null, không phải lỗi', async () => {
    const { ctrl, qna } = makeController();
    await ctrl.create(HOP_LE as never, req());
    expect(qna.create).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });

  it('có Bearer + `userId` là số thì ghi nhận user', async () => {
    const { ctrl, qna } = makeController();
    await ctrl.create(HOP_LE as never, req('Bearer abc', { userId: 7 }));
    expect(qna.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 7 }));
  });

  // `AuthGuard` để `userId` là **chuỗi** ở một số đường token cũ; ép số từ chuỗi
  // đúng định dạng thì vẫn gắn được, còn chuỗi rác thì bỏ qua chứ không ghi bậy.
  it('`userId` là chuỗi số thì ép được', async () => {
    const { ctrl, qna } = makeController();
    await ctrl.create(HOP_LE as never, req('Bearer abc', { userId: '7' }));
    expect(qna.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 7 }));
  });

  it('`userId` là chuỗi rác thì bỏ qua, để null', async () => {
    const { ctrl, qna } = makeController();
    await ctrl.create(HOP_LE as never, req('Bearer abc', { userId: 'abc' }));
    expect(qna.create).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });

  it('`userId` là số thập phân thì bỏ qua (chỉ nhận số nguyên)', async () => {
    const { ctrl, qna } = makeController();
    await ctrl.create(HOP_LE as never, req('Bearer abc', { userId: 7.5 }));
    expect(qna.create).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });

  it('có Bearer nhưng guard chưa gắn `user` thì vẫn null, không ném', async () => {
    const { ctrl, qna } = makeController();
    await ctrl.create(HOP_LE as never, req('Bearer abc'));
    expect(qna.create).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });

  // Đọc `req.user` là thao tác trên object lạ — nếu nó ném, `catch {}` phải nuốt
  // và câu hỏi vẫn được ghi chứ không thành 500.
  it('`req.user` ném lỗi thì bỏ qua userId, không 500', async () => {
    const { ctrl, qna } = makeController();
    const reqBom = {
      headers: { authorization: 'Bearer abc' },
      get user(): never {
        throw new Error('user chưa sẵn sàng');
      },
    } as never;
    await ctrl.create(HOP_LE as never, reqBom);
    expect(qna.create).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });
});

describe('GET /api/qna — route có guard', () => {
  it('trả về danh sách từ service', async () => {
    const { ctrl, qna } = makeController();
    expect(await ctrl.list()).toEqual([{ id: 42 }]);
    expect(qna.findAll).toHaveBeenCalled();
  });
});
