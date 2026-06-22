import { Request, Response } from "express";
import { clearApplicationHttpCache } from "../utils/cache";
import { auditService } from "../services/audit.service";
import { sendError } from "../utils/response";

export const adminCacheController = {
  /** Xóa toàn bộ key cache ứng dụng (tiền tố `jp:cache:`). Không flush DB Redis. */
  clearApplication: async (req: Request, res: Response) => {
    try {
      const keysDeleted = await clearApplicationHttpCache();
      await auditService.log(req, {
        action: "admin:cache:clear_application",
        entityType: "RedisCache",
        entityId: "jp:cache:*",
        metadata: { keysDeleted },
      });
      return res.json({
        data: { keysDeleted },
        message:
          keysDeleted === 0
            ? "Không có key cache ứng dụng nào (hoặc Redis trống phần này)."
            : `Đã xóa ${keysDeleted} key cache ứng dụng.`,
      });
    } catch (e) {
      await auditService.log(req, {
        action: "admin:cache:clear_application",
        entityType: "RedisCache",
        entityId: "jp:cache:*",
        success: false,
        metadata: { error: String(e) },
      });
      return sendError(res, 503, {
        code: "REDIS_UNAVAILABLE",
        message: "Không xóa được cache Redis. Kiểm tra kết nối Redis.",
        traceId: req.requestId,
      });
    }
  },
};
