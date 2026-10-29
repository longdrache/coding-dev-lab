export const MAX_SOURCE_LENGTH = 120;
export const MAX_INGEST_BYTES = 5 * 1024 * 1024;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export type IngestValidation = { ok: true } | { ok: false; message: string };

export function validateIngestInput(source: string, text: string): IngestValidation {
  if (!text.trim()) return { ok: false, message: "Tài liệu đang rỗng." };
  if (!source.trim()) return { ok: false, message: "Chưa nhập nguồn (source)." };
  const sourceTrimmed = source.trim();
  if (sourceTrimmed.length > MAX_SOURCE_LENGTH) {
    return { ok: false, message: `Nguồn tối đa ${MAX_SOURCE_LENGTH} ký tự.` };
  }
  const bytes = utf8ByteLength(text);
  if (bytes > MAX_INGEST_BYTES) {
    return { ok: false, message: "Tài liệu vượt quá 5 MB, hãy chia nhỏ." };
  }
  return { ok: true };
}

export type IngestResponse = { ok?: boolean; message?: string };

export function isIngestSuccess(
  status: number,
  data: IngestResponse | null,
): boolean {
  return status >= 200 && status < 300 && data?.ok === true;
}

export function ingestErrorMessage(
  status: number,
  data: IngestResponse | null,
): string {
  const msg = data?.message?.trim();
  if (msg) return msg;
  return `Nhập thất bại (HTTP ${status}).`;
}