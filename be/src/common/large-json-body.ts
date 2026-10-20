import { json, type RequestHandler } from 'express';

/** Đường dẫn duy nhất nhận tài liệu RAG dung lượng lớn. */
export const RAG_INGEST_PATH = '/api/admin/rag/ingest';

/**
 * Nest bỏ qua parser JSON mặc định khi thấy layer tên `jsonParser`.
 * Bọc parser trong một hàm tên khác để Nest vẫn đăng ký parser mặc định cho
 * các route còn lại, trong khi path này được parse trước với hạn mức lớn hơn.
 */
const largeJson = json({ limit: '12mb' });

export const ragIngestBodyParser: RequestHandler = (req, res, next) => {
  largeJson(req, res, next);
};
