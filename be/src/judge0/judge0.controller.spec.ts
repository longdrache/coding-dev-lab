import { describe, expect, it, vi } from 'vitest';
import { Judge0Controller } from './judge0.controller.ts';
import { Judge0Service } from './judge0.service.ts';

/**
 * Controller này gần như **toàn bộ** là validate: nó chặn body rác trước khi gọi
 * Judge0, và ba nhánh bảo vệ đó (thiếu `source_code`/`language_id`, quá 10 mục,
 * quá 64k ký tự) là thứ chặn một client hỏng làm cháy hàng trăm request lên
 * Judge0 — tốn quota của dự án.
 *
 * Vì vậy test ở đây canh cả hai mặt: **từ chối** đúng cái, và **cho qua** đúng
 * cái. Chỉ test mặt từ chối thì dễ trượt sang trường hợp controller từ chối cả
 * request hợp lệ — lỗi đó chỉ lộ ra ở e2e và làm hỏng luồng nộp bài thật.
 */

const MAX_BATCH_SIZE = 10;
const MAX_SOURCE_CODE_LENGTH = 64_000;

function makeController() {
  const svc = {
    createSubmission: vi.fn().mockResolvedValue({ token: 'tok-1' }),
    createBatchSubmissions: vi.fn().mockResolvedValue([{ token: 'tok-1' }]),
    getBatchSubmissions: vi.fn().mockResolvedValue([{ token: 'tok-1', status: 'Accepted' }]),
    getSubmission: vi.fn().mockResolvedValue({ token: 'tok-1' }),
  };
  return { ctrl: new Judge0Controller(svc as never), svc };
}

const item = (over: Record<string, unknown> = {}) => ({
  language_id: 63,
  source_code: 'print(1)',
  ...over,
});

describe('POST /api/submissions — mỗi lần nộp', () => {
  it('body hợp lệ thì xuống thẳng Judge0', async () => {
    const { ctrl, svc } = makeController();
    const body = item();
    expect(await ctrl.createSubmission(body as never)).toEqual({ token: 'tok-1' });
    expect(svc.createSubmission).toHaveBeenCalledWith(body);
  });

  it('thiếu `source_code` thì 400, không gọi Judge0', async () => {
    const { ctrl, svc } = makeController();
    expect(() => ctrl.createSubmission({ language_id: 63 } as never)).toThrow(
      'language_id và source_code là bắt buộc',
    );
    expect(svc.createSubmission).not.toHaveBeenCalled();
  });

  it('`language_id` là chuỗi thì 400 — Judge0 sẽ trả lỗi khó đọc hơn nhiều', async () => {
    const { ctrl, svc } = makeController();
    expect(() =>
      ctrl.createSubmission({ language_id: '63', source_code: 'x' } as never),
    ).toThrow('language_id và source_code là bắt buộc');
    expect(svc.createSubmission).not.toHaveBeenCalled();
  });

  it('body rỗng thì 400 chứ không ném lỗi kiểu khác', async () => {
    const { ctrl, svc } = makeController();
    expect(() => ctrl.createSubmission({} as never)).toThrow(
      'language_id và source_code là bắt buộc',
    );
    expect(svc.createSubmission).not.toHaveBeenCalled();
  });

  it('source_code vượt giới hạn thì 400 trước khi tốn quota', async () => {
    const { ctrl, svc } = makeController();
    const lon = 'a'.repeat(MAX_SOURCE_CODE_LENGTH + 1);
    expect(() => ctrl.createSubmission(item({ source_code: lon }) as never)).toThrow(
      `source_code tối đa ${MAX_SOURCE_CODE_LENGTH} ký tự`,
    );
    expect(svc.createSubmission).not.toHaveBeenCalled();
  });

  // Biên đúng bằng giới hạn phải đi qua: chặn nhầm ở `>=` là chặn cả bài hợp lệ.
  it('source_code đúng bằng giới hạn thì vẫn nộp được', async () => {
    const { ctrl, svc } = makeController();
    const vua = 'a'.repeat(MAX_SOURCE_CODE_LENGTH);
    await ctrl.createSubmission(item({ source_code: vua }) as never);
    expect(svc.createSubmission).toHaveBeenCalled();
  });
});

describe('POST /api/submissions/batch', () => {
  it('mảng hợp lệ thì chuyển nguyên xuống service', async () => {
    const { ctrl, svc } = makeController();
    const list = [item(), item({ source_code: 'print(2)' })];
    expect(await ctrl.createBatchSubmissions({ submissions: list } as never)).toEqual([
      { token: 'tok-1' },
    ]);
    expect(svc.createBatchSubmissions).toHaveBeenCalledWith(list);
  });

  it('thiếu `submissions` thì 400', async () => {
    const { ctrl, svc } = makeController();
    expect(() => ctrl.createBatchSubmissions({} as never)).toThrow(
      'submissions phải là mảng không rỗng',
    );
    expect(svc.createBatchSubmissions).not.toHaveBeenCalled();
  });

  it('mảng rỗng thì 400', async () => {
    const { ctrl, svc } = makeController();
    expect(() => ctrl.createBatchSubmissions({ submissions: [] } as never)).toThrow(
      'submissions phải là mảng không rỗng',
    );
    expect(svc.createBatchSubmissions).not.toHaveBeenCalled();
  });

  it('`submissions` không phải mảng thì 400', async () => {
    const { ctrl, svc } = makeController();
    expect(() => ctrl.createBatchSubmissions({ submissions: 'x' } as never)).toThrow(
      'submissions phải là mảng không rỗng',
    );
    expect(svc.createBatchSubmissions).not.toHaveBeenCalled();
  });

  it('vượt 10 mục thì 400 — đây là chốt chặn quota', async () => {
    const { ctrl, svc } = makeController();
    const nhieu = Array.from({ length: MAX_BATCH_SIZE + 1 }, () => item());
    expect(() => ctrl.createBatchSubmissions({ submissions: nhieu } as never)).toThrow(
      `tối đa ${MAX_BATCH_SIZE} submissions mỗi batch`,
    );
    expect(svc.createBatchSubmissions).not.toHaveBeenCalled();
  });

  it('đúng 10 mục thì vẫn nộp được', async () => {
    const { ctrl, svc } = makeController();
    const vua = Array.from({ length: MAX_BATCH_SIZE }, () => item());
    await ctrl.createBatchSubmissions({ submissions: vua } as never);
    expect(svc.createBatchSubmissions).toHaveBeenCalled();
  });

  // Một mục hỏng giữa mảng phải chặn **cả** mảng: nếu chỉ validate mục đầu thì
  // mục hỏng đi thẳng lên Judge0.
  it('một mục hỏng ở giữa mảng thì cả batch bị chặn', async () => {
    const { ctrl, svc } = makeController();
    const hong = [item(), item({ language_id: '63' }), item()];
    expect(() => ctrl.createBatchSubmissions({ submissions: hong } as never)).toThrow(
      'mỗi submission cần language_id và source_code',
    );
    expect(svc.createBatchSubmissions).not.toHaveBeenCalled();
  });

  it('mục hỏng vì quá dài cũng chặn cả batch', async () => {
    const { ctrl, svc } = makeController();
    const hong = [item(), item({ source_code: 'a'.repeat(MAX_SOURCE_CODE_LENGTH + 1) })];
    expect(() => ctrl.createBatchSubmissions({ submissions: hong } as never)).toThrow(
      `source_code tối đa ${MAX_SOURCE_CODE_LENGTH} ký tự`,
    );
    expect(svc.createBatchSubmissions).not.toHaveBeenCalled();
  });
});

describe('GET /api/submissions/batch — tra kết quả theo token', () => {
  it('tách token theo dấu phẩy và bỏ khoảng trắng thừa', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.getBatchSubmissions(' a , b ,c');
    expect(svc.getBatchSubmissions).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('thiếu `tokens` thì 400', async () => {
    const { ctrl, svc } = makeController();
    expect(() => ctrl.getBatchSubmissions()).toThrow('tokens là bắt buộc');
    expect(svc.getBatchSubmissions).not.toHaveBeenCalled();
  });

  it('`tokens` toàn khoảng trắng/dấu phẩy thì coi như rỗng và 400', async () => {
    const { ctrl, svc } = makeController();
    expect(() => ctrl.getBatchSubmissions(' , , ')).toThrow('tokens là bắt buộc');
    expect(svc.getBatchSubmissions).not.toHaveBeenCalled();
  });

  it('vượt 10 token thì 400', async () => {
    const { ctrl, svc } = makeController();
    const nhieu = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `t${i}`).join(',');
    expect(() => ctrl.getBatchSubmissions(nhieu)).toThrow(
      `tối đa ${MAX_BATCH_SIZE} tokens mỗi lần`,
    );
    expect(svc.getBatchSubmissions).not.toHaveBeenCalled();
  });

  it('đúng 10 token thì vẫn tra được', async () => {
    const { ctrl, svc } = makeController();
    const vua = Array.from({ length: MAX_BATCH_SIZE }, (_, i) => `t${i}`).join(',');
    await ctrl.getBatchSubmissions(vua);
    expect(svc.getBatchSubmissions).toHaveBeenCalled();
  });
});

describe('GET /api/submissions/:token', () => {
  it('chuyển token xuống service', async () => {
    const { ctrl, svc } = makeController();
    expect(await ctrl.getSubmission('tok-1')).toEqual({ token: 'tok-1' });
    expect(svc.getSubmission).toHaveBeenCalledWith('tok-1');
  });
});
