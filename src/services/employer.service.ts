import { emailQueue } from "../queues/email.queue";
import { HttpException } from "../utils/exception";
import { prisma, prismaTransaction } from "../utils/prisma";
import { invalidateAdminDashboard, invalidateJobCaches } from "../utils/cache";
import { companyService } from "./company.service";
import { logger } from "../utils/logger";

export const employerService = {
  async findEmployer(employerId: number) {
    if (isNaN(employerId)) throw new HttpException("Invalid ID", 400);
    return await prisma.employer.findUnique({
      where: { userId: employerId },
    });
  },

  async approveEmployer(
    employerId: number,
    opts?: { skipCacheInvalidate?: boolean },
  ) {
    if (isNaN(employerId)) throw new HttpException("Invalid ID", 400);
    await prismaTransaction(async (tx) => {
      const employer = await tx.employer.findUnique({
        where: { id: employerId },
        include: { user: true },
      });

      if (!employer) {
        throw new HttpException("Không tìm thấy nhà tuyển dụng", 404);
      }

      await emailQueue.add("send-email-notification", {
        to: employer.user.email,
        subject: "Tài khoản đã được phê duyệt",
        template: "approve-account",
        options: {
          username: employer.user.username,
          appName: "TopCV",
        },
      });

      await tx.employer.update({
        where: { id: employerId },
        data: { status: "APPROVED" },
      });

      if (employer.companyId) {
        await companyService.updateCompanyStatus(employer.companyId, true, tx);
      }
    });
    if (!opts?.skipCacheInvalidate) {
      await Promise.all([invalidateAdminDashboard(), invalidateJobCaches()]);
    }
    return { message: "Duyệt thành công" };
  },

  async approveAllPendingEmployers(): Promise<{
    approved: number;
    totalPending: number;
  }> {
    const pending = await prisma.employer.findMany({
      where: { status: "PENDING" },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const totalPending = pending.length;
    if (!totalPending) {
      return { approved: 0, totalPending: 0 };
    }
    let approved = 0;
    for (const { id } of pending) {
      try {
        await employerService.approveEmployer(id, {
          skipCacheInvalidate: true,
        });
        approved += 1;
      } catch (error) {
        logger.warn("approveAllPendingEmployers skipped failed item", {
          employerId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (approved > 0) {
      await Promise.all([invalidateAdminDashboard(), invalidateJobCaches()]);
    }
    return { approved, totalPending };
  },

  async rejectEmployer(employerId: number, reason: string) {
    if (isNaN(employerId)) throw new HttpException("Invalid ID", 400);
    await prismaTransaction(async (tx) => {
      const employer = await tx.employer.findUnique({
        where: { id: employerId },
        include: { user: true },
      });

      if (!employer) {
        throw new HttpException("Không tìm thấy nhà tuyển dụng", 404);
      }

      await emailQueue.add("send-email-notification", {
        to: employer.user.email,
        subject: "Tài khoản chưa được phê duyệt",
        template: "reject-account",
        options: {
          username: employer.user.username,
          appName: "TopCV",
          reason,
        },
      });

      const companyId = employer.companyId;
      const userId = employer.userId;

      const deletedAt = new Date();
      await tx.employer.update({
        where: { id: employerId },
        data: { status: "REJECTED" },
      });

      if (companyId) {
        const remainingEmployers = await tx.employer.count({
          where: {
            companyId,
            id: { not: employerId },
            status: { not: "REJECTED" },
          },
        });
        if (remainingEmployers === 0) {
          const jobs = await tx.job.findMany({
            where: { companyId, deletedAt: null },
            select: { id: true },
          });
          const jobIds = jobs.map((j) => j.id);
          if (jobIds.length > 0) {
            await tx.job.updateMany({
              where: { id: { in: jobIds } },
              data: { deletedAt },
            });
          }
          await tx.company.update({
            where: { id: companyId },
            data: { deletedAt, status: false },
          });
        }
      }

      await tx.user.update({
        where: { id: userId },
        data: { deletedAt, isBlocked: true },
      });
    });
    await Promise.all([invalidateAdminDashboard(), invalidateJobCaches()]);
    return { message: "Từ chối thành công" };
  },
  async getPendingEmployers() {
    const employers = await prisma.employer.findMany({
      where: { status: "PENDING" },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
            userPhone: true,
          },
        },
        company: {
          include: {
            province: true,
            district: true,
          },
        },
      },
    });

    return employers.map((e) => ({
      id: e.user.id,
      username: e.user.username,
      email: e.user.email,
      isVerified: e.user.isVerified,
      userPhone: e.user.userPhone,
      userRoles: e.user.userRoles,
      employerStatus: e.status,
      company: e.company
        ? {
            id: e.company.id,
            name: e.company.name,
            location: e.company.location,
            district: e.company.district,
            province: e.company.province,
          }
        : null,
      employerId: e.id,
      createdAt: e.user.createdAt,
    }));
  },
  async getByCompany(companyId: number) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new HttpException("Công ty không tồn tại", 404);
    }

    const employers = await prisma.employer.findMany({
      where: {
        companyId,
        status: "APPROVED",
      },
      include: {
        user: true,
      },
      orderBy: {
        id: "desc",
      },
    });

    return employers.map((item) => ({
      id: item.id,
      name: item.user.username,
      email: item.user.email,
    }));
  },
};
