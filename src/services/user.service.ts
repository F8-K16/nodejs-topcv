import { createHash, randomBytes } from "node:crypto";

import { Prisma } from "../generated/prisma/client";
import type { PrismaTransactionClient } from "../utils/prisma";
import { UserDto } from "../types/user.type";
import { HttpException } from "../utils/exception";
import { hashPassword } from "../utils/hashing";
import { prisma, prismaTransaction } from "../utils/prisma";
import {
  invalidateAdminDashboard,
  invalidateJobCaches,
  invalidateUserAuthDataCache,
} from "../utils/cache";
import { enqueueDeleteJobIndex, enqueueUpsertJobIndex } from "../search/jobs.indexer";

type UserWithPermissions = Prisma.UserGetPayload<{
  select: {
    userRoles: {
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: {
                  select: {
                    name: true;
                  };
                };
              };
            };
          };
        };
      };
    };
    userPermissions: {
      include: {
        permission: {
          select: {
            name: true;
          };
        };
      };
    };
  };
}>;

function buildUserPermissions(user: UserWithPermissions): string[] {
  const rolePermissions = user.userRoles.flatMap((ur) =>
    ur.role.rolePermissions.map((rp) => rp.permission.name),
  );

  const userPermissions = user.userPermissions.map((up) => up.permission.name);

  return [...new Set([...rolePermissions, ...userPermissions])];
}

export const userService = {
  async existingEmail(email: string, excludeUserId?: number) {
    const count = await prisma.user.findFirst({
      where: {
        email,
        ...(excludeUserId !== undefined && {
          id: {
            not: excludeUserId,
          },
        }),
      },
    });
    return count;
  },
  async existingPhone(phone: string, excludeUserId?: number) {
    const phoneRecord = await prisma.userPhone.findFirst({
      where: { phone },
    });

    if (!phoneRecord) return null;

    if (excludeUserId !== undefined && phoneRecord.userId === excludeUserId) {
      return null;
    }

    return phoneRecord;
  },

  async findByEmail(email: string) {
    const user = await prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });
    return user;
  },
  async findById(id: number) {
    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        userPhone: {
          select: {
            phone: true,
          },
        },
        candidate: {
          select: {
            provinceId: true,
            districtId: true,
            province: { select: { id: true, name: true } },
            district: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) return null;

    const { password, totpSecret, userPhone, candidate, ...rest } = user;
    void password;
    void totpSecret;
    return {
      ...rest,
      phone: userPhone?.phone || null,
      provinceId: candidate?.provinceId ?? null,
      districtId: candidate?.districtId ?? null,
      provinceName: candidate?.province?.name ?? null,
      districtName: candidate?.district?.name ?? null,
    };
  },

  async getUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string | string[];
    isVerified?: string;
    isBlocked?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 12;
    const skip = (page - 1) * limit;

    const roleArray = Array.isArray(query.role)
      ? query.role
      : query.role
        ? [query.role]
        : [];

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.search && {
        OR: [
          { email: { contains: query.search } },
          { username: { contains: query.search } },
          {
            userPhone: {
              is: {
                phone: {
                  contains: query.search,
                },
              },
            },
          },
        ],
      }),

      ...(query.isVerified && {
        isVerified: query.isVerified === "true",
      }),

      ...(query.isBlocked === "true" || query.isBlocked === "false"
        ? {
            isBlocked: query.isBlocked === "true",
          }
        : {}),

      ...(roleArray.length > 0 && {
        userRoles: {
          some: {
            role: {
              name: {
                in: roleArray,
              },
            },
          },
        },
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          username: true,
          avatar: true,
          isVerified: true,
          isBlocked: true,
          createdAt: true,

          userPhone: {
            select: {
              phone: true,
            },
          },

          userRoles: {
            include: {
              role: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getUserById(id: number) {
    if (isNaN(id)) {
      throw new HttpException("Invalid ID", 400);
    }
    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        username: true,
        isVerified: true,
        isBlocked: true,
        createdAt: true,

        userPhone: {
          select: { phone: true },
        },

        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },

        userPermissions: {
          include: {
            permission: true,
          },
        },

        candidate: {
          include: {
            province: true,
            district: true,
            resumes: true,
            applications: {
              include: {
                job: {
                  include: {
                    employer: {
                      include: {
                        company: {
                          select: {
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },

        employer: {
          include: {
            company: {
              include: {
                categories: {
                  include: {
                    parentCategory: {
                      select: { id: true, name: true, slug: true },
                    },
                  },
                },
              },
            },
            jobs: {
              include: {
                applications: {
                  include: {
                    candidate: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    const allPermissions = buildUserPermissions(
      user as unknown as UserWithPermissions,
    );

    return {
      ...user,
      allPermissions,
    };
  },

  syntheticGooglePhones(googleSub: string, email: string) {
    const phones: string[] = [];
    for (let i = 0; i < 8; i++) {
      const slice = createHash("sha256")
        .update(`${googleSub}:${email}:${i}`)
        .digest("hex");
      phones.push(`09${slice.slice(0, 8)}`);
    }
    return phones;
  },

  async clearSyntheticGooglePhone(
    userId: number,
    email: string,
    googleSub: string,
  ) {
    const row = await prisma.userPhone.findUnique({ where: { userId } });
    if (!row) return false;
    if (!this.syntheticGooglePhones(googleSub, email).includes(row.phone)) {
      return false;
    }
    await prisma.userPhone.delete({ where: { userId } });
    await invalidateUserAuthDataCache(userId);
    return true;
  },

  async createGoogleUser(params: {
    email: string;
    nameHint: string;
    googleSub: string;
    avatar?: string | null;
  }) {
    const candidateRole = await prisma.role.findFirst({
      where: { name: "CANDIDATE" },
    });
    if (!candidateRole) {
      throw new HttpException("Thiếu vai trò CANDIDATE trên hệ thống", 500, "CONFIG_ERROR");
    }

    const buildUsernameBase = () => {
      const fromName = params.nameHint.replace(/\s+/g, " ").trim();
      if (fromName.length > 0) return fromName.slice(0, 30);
      const fromEmail = params.email.split("@")[0] ?? "user";
      const clean = fromEmail.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 24);
      return (clean || "user").slice(0, 30);
    };

    const randomPassword = hashPassword(randomBytes(48).toString("hex"));

    let baseUsername = buildUsernameBase();
    if (!baseUsername) baseUsername = "user";
    let username = baseUsername.slice(0, 30);
    let attempt = 0;
    while (await prisma.user.findFirst({ where: { username } })) {
      attempt += 1;
      const suffix = `_${attempt}`;
      username = (baseUsername.slice(0, 30 - suffix.length) + suffix).slice(
        0,
        30,
      );
    }

    const created = await prismaTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: params.email,
          username,
          password: randomPassword,
          isVerified: true,
          ...(params.avatar ? { avatar: params.avatar } : {}),
        },
        select: {
          id: true,
          email: true,
          username: true,
          isVerified: true,
          avatar: true,
        },
      });
      await tx.userRole.create({
        data: { userId: user.id, roleId: candidateRole.id },
      });
      await this.syncUserProfile(tx, user.id, [candidateRole.id]);
      return user;
    });
    await invalidateAdminDashboard();
    return created;
  },

  async createUser(userData: UserDto, roleIds: number[] = []) {
    const hashedPassword = await hashPassword(userData.password);

    const created = await prismaTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: userData.email,
          username: userData.username,
          password: hashedPassword,
          isVerified: userData.isVerified ?? true,

          userPhone: {
            create: {
              phone: userData.phone!,
            },
          },
        },
        select: {
          id: true,
          email: true,
          username: true,
          isVerified: true,
        },
      });

      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({
            userId: user.id,
            roleId,
          })),
        });
      }
      await this.syncUserProfile(tx, user.id, roleIds);
      return user;
    });
    await invalidateAdminDashboard();
    return created;
  },

  async updateUser(
    userId: number,
    userData: Partial<UserDto>,
    roleIds: number[] = [],
  ) {
    if (isNaN(userId)) {
      throw new HttpException("Invalid ID", 400);
    }
    const updated = await prismaTransaction(async (tx) => {
      const updateData: Prisma.UserUpdateInput = {
        ...(userData.email && { email: userData.email }),
        ...(userData.username && { username: userData.username }),
        ...(typeof userData.isVerified === "boolean" && {
          isVerified: userData.isVerified,
        }),
        ...(typeof userData.isBlocked === "boolean" && {
          isBlocked: userData.isBlocked,
        }),
      };

      const user = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          username: true,
          isVerified: true,
        },
      });

      if (userData.phone) {
        const existingPhone = await tx.userPhone.findUnique({
          where: { userId },
        });

        if (existingPhone) {
          await tx.userPhone.update({
            where: { userId },
            data: { phone: userData.phone },
          });
        } else {
          await tx.userPhone.create({
            data: {
              userId,
              phone: userData.phone,
            },
          });
        }
      }

      await tx.userRole.deleteMany({
        where: { userId },
      });

      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({
            userId,
            roleId,
          })),
        });
      }
      await this.syncUserProfile(tx, user.id, roleIds);
      return user;
    });
    await invalidateUserAuthDataCache(userId);
    await invalidateAdminDashboard();
    return updated;
  },

  async deleteUser(id: number) {
    if (isNaN(id)) {
      throw new HttpException("Invalid ID", 400);
    }

    const removed = await prismaTransaction(async (tx) => {
      const deletedAt = new Date();
      const employers = await tx.employer.findMany({
        where: { userId: id },
        select: { id: true },
      });
      const employerIds = employers.map((e) => e.id);

      if (employerIds.length > 0) {
        const jobs = await tx.job.findMany({
          where: { employerId: { in: employerIds } },
          select: { id: true },
        });
        const jobIds = jobs.map((j) => j.id);
        if (jobIds.length > 0) {
          await tx.job.updateMany({
            where: { id: { in: jobIds } },
            data: { deletedAt },
          });
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          deletedAt,
          isBlocked: true,
        },
        select: {
          id: true,
          email: true,
        },
      });
    });
    await invalidateUserAuthDataCache(id);
    await Promise.all([invalidateAdminDashboard(), invalidateJobCaches()]);
    const hiddenJobs = await prisma.job.findMany({
      where: { employer: { userId: id }, deletedAt: { not: null } },
      select: { id: true },
    });
    await Promise.all(hiddenJobs.map((job) => enqueueDeleteJobIndex(job.id)));
    return removed;
  },

  async restoreUser(id: number) {
    if (isNaN(id)) {
      throw new HttpException("Invalid ID", 400);
    }
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new HttpException("Không tìm thấy người dùng", 404);

    const restored = await prisma.user.update({
      where: { id },
      data: { deletedAt: null, isBlocked: false },
      select: { id: true, email: true },
    });
    const jobs = await prisma.job.findMany({
      where: {
        employer: { userId: id },
        deletedAt: { not: null },
        company: { deletedAt: null },
        category: { deletedAt: null },
      },
      select: { id: true },
    });
    await prisma.job.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: { deletedAt: null },
    });
    await invalidateUserAuthDataCache(id);
    await Promise.all([invalidateAdminDashboard(), invalidateJobCaches()]);
    await Promise.all(jobs.map((job) => enqueueUpsertJobIndex(job.id)));
    return restored;
  },

  async syncUserProfile(
    tx: PrismaTransactionClient,
    userId: number,
    roleIds: number[],
  ) {
    const roles = await tx.role.findMany({
      where: {
        id: { in: roleIds },
      },
      select: {
        name: true,
      },
    });
    const roleNames = roles.map((r) => r.name);
    const isCandidate = roleNames.includes("CANDIDATE");
    const isEmployer = roleNames.includes("EMPLOYER");

    const existingCandidate = await tx.candidate.findUnique({
      where: { userId },
    });

    if (isCandidate && !existingCandidate) {
      await tx.candidate.create({
        data: { userId },
      });
    }

    if (!isCandidate && existingCandidate) {
      await tx.candidate.delete({
        where: { userId },
      });
    }

    const existingEmployer = await tx.employer.findUnique({
      where: { userId },
    });

    if (isEmployer && !existingEmployer) {
      await tx.employer.create({
        data: { userId },
      });
    }

    if (!isEmployer && existingEmployer) {
      await tx.employer.delete({
        where: { userId },
      });
    }
  },

  async assignPermissionsToUser(userId: number, permissionIds: number[]) {
    await prisma.userPermission.deleteMany({
      where: { userId },
    });

    const result = await prisma.userPermission.createMany({
      data: permissionIds.map((pid) => ({
        userId,
        permissionId: pid,
      })),
    });
    await invalidateUserAuthDataCache(userId);
    return result;
  },
};
