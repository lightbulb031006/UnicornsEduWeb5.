import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/client';
import {
  generateStudentId,
  generateStaffId,
  isEntityIdUniqueConstraintError,
} from 'src/common/entity-id';
import { StaffRole, StudentClassStatus, UserRole } from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import { AuthService } from 'src/auth/auth.service';
import { STAFF_DATA_CONSENT_VERSION } from 'src/auth/constants';
import {
  UpdateMyProfileDto,
  UpdateMyStaffProfileDto,
  UpdateMyStudentProfileDto,
} from 'src/dtos/profile.dto';
import {
  AdminCreateStudentUserDto,
  AdminCreateUserDto,
  GetUsersQueryDto,
  UpdateUserDto,
} from 'src/dtos/user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  createSignedStorageUrl,
  getSupabaseAdminClient,
  normalizeHttpHttpsUrl,
  type UploadableFile,
  validateImageFile,
} from 'src/storage/supabase-storage';
import {
  getUserFullNameFromParts,
  getPreferredUserFullName,
  splitFullName,
} from 'src/common/user-name.util';

type UserAuditClient = Prisma.TransactionClient | PrismaService;
const AVATAR_STORAGE_BUCKET = 'avatars';
const AVATAR_STORAGE_PATH_SEGMENT = 'avatar';
const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly authService: AuthService,
  ) {}

  private buildAvatarStoragePath(userId: string) {
    return `users/${userId}/${AVATAR_STORAGE_PATH_SEGMENT}`;
  }

  private async createAvatarSignedUrl(path?: string | null) {
    return createSignedStorageUrl({
      bucket: AVATAR_STORAGE_BUCKET,
      path,
      expiresIn: AVATAR_SIGNED_URL_TTL_SECONDS,
    });
  }

  private validateAvatarImageFile(file: UploadableFile | undefined) {
    validateImageFile(file, 'Ảnh đại diện');
  }

  private async attachProfileMediaUrls<
    T extends {
      avatarPath?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      accountHandle?: string | null;
      email?: string | null;
      staffInfo?: Record<string, unknown> | null;
    },
  >(profile: T) {
    const fullName = getPreferredUserFullName(profile) ?? null;
    const avatarUrl = await this.createAvatarSignedUrl(profile.avatarPath);

    return {
      ...profile,
      fullName,
      avatarUrl,
      staffInfo: profile.staffInfo
        ? {
            ...profile.staffInfo,
            fullName: fullName ?? '',
          }
        : profile.staffInfo,
    };
  }

  private sanitizeUser<
    T extends {
      passwordHash: string | null;
      refreshToken: string | null;
      emailVerified?: boolean | null;
      phoneVerified?: boolean | null;
    },
  >(user: T): Omit<T, 'passwordHash' | 'refreshToken'> {
    const { passwordHash, refreshToken, ...safeUser } = user;
    void passwordHash;
    void refreshToken;
    return {
      ...safeUser,
      emailVerified: Boolean(safeUser.emailVerified),
      phoneVerified: Boolean(safeUser.phoneVerified),
    };
  }

  private serializeUserDetail<
    T extends {
      passwordHash: string | null;
      refreshToken: string | null;
      accountHandle: string;
      email: string;
      first_name?: string | null;
      last_name?: string | null;
      staffInfo?: { id: string; roles?: StaffRole[] | null } | null;
      studentInfo?: { id: string } | null;
    },
  >(user: T) {
    const sanitized = this.sanitizeUser(user);

    return {
      ...sanitized,
      fullName: getPreferredUserFullName(sanitized) ?? null,
      staffInfo: user.staffInfo
        ? {
            id: user.staffInfo.id,
            roles: user.staffInfo.roles ?? [],
          }
        : null,
      studentInfo: user.studentInfo ? { id: user.studentInfo.id } : null,
    };
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private async withEntityIdRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxAttempts = 5;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isEntityIdUniqueConstraintError(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw new BadRequestException(
      'Could not generate a unique entity id. Please retry.',
      { cause: lastError },
    );
  }

  private isNotFoundError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2025'
    );
  }

  private async generateAutoStaffCccdNumber(tx: Prisma.TransactionClient) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${Date.now().toString().slice(-10)}${Math.floor(
        Math.random() * 100,
      )
        .toString()
        .padStart(2, '0')}`;
      const existing = await tx.staffInfo.findUnique({
        where: { cccdNumber: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }

    throw new InternalServerErrorException(
      'Không thể tạo số CCCD mặc định cho hồ sơ nhân sự.',
    );
  }

  private getUserAuditSnapshot(db: UserAuditClient, userId: string) {
    return db.user.findUnique({
      where: { id: userId },
      include: {
        staffInfo: true,
        studentInfo: true,
      },
    });
  }

  private getStaffAuditSnapshot(db: UserAuditClient, staffId: string) {
    return db.staffInfo.findUnique({
      where: { id: staffId },
    });
  }

  private getStudentAuditSnapshot(db: UserAuditClient, studentId: string) {
    return db.studentInfo.findUnique({
      where: { id: studentId },
    });
  }

  private getPreferredProfileFullName(user: {
    first_name?: string | null;
    last_name?: string | null;
    accountHandle: string;
    email: string;
  }) {
    return getPreferredUserFullName(user) ?? user.email;
  }

  private normalizeSelfStaffNameInput(dto: UpdateMyStaffProfileDto) {
    if (dto.full_name !== undefined) {
      const normalizedFullName = dto.full_name.trim();
      if (!normalizedFullName) {
        throw new BadRequestException('Tên nhân sự không được để trống.');
      }

      return splitFullName(normalizedFullName);
    }

    const payload: {
      first_name?: string;
      last_name?: string | null;
    } = {};

    if (dto.first_name !== undefined) {
      const firstName = dto.first_name.trim();
      if (!firstName) {
        throw new BadRequestException('first_name không được để trống.');
      }
      payload.first_name = firstName;
    }

    if (dto.last_name !== undefined) {
      const lastName = dto.last_name.trim();
      payload.last_name = lastName || null;
    }

    return payload;
  }

  private normalizeStaffRoles(staffRoles?: StaffRole[]) {
    if (!Array.isArray(staffRoles)) {
      return undefined;
    }

    const normalizedRoles = Array.from(
      new Set(
        staffRoles.filter((role): role is StaffRole =>
          Object.values(StaffRole).includes(role),
        ),
      ),
    );

    return normalizedRoles;
  }

  private buildUserSearchWhere(search?: string): Prisma.UserWhereInput {
    const trimmedSearch = search?.trim();
    if (!trimmedSearch) {
      return {};
    }

    const tokens = trimmedSearch
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (tokens.length === 0) {
      return {};
    }

    return {
      AND: tokens.map((token) => ({
        OR: [
          {
            accountHandle: {
              contains: token,
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: token,
              mode: 'insensitive',
            },
          },
          {
            phone: {
              contains: token,
              mode: 'insensitive',
            },
          },
          {
            first_name: {
              contains: token,
              mode: 'insensitive',
            },
          },
          {
            last_name: {
              contains: token,
              mode: 'insensitive',
            },
          },
        ],
      })),
    };
  }

  async getUsers(query: GetUsersQueryDto) {
    const parsedPage = Number(query.page);
    const parsedLimit = Number(query.limit);
    const page =
      Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit =
      Number.isInteger(parsedLimit) && parsedLimit >= 1
        ? Math.min(parsedLimit, 100)
        : 20;
    const where = this.buildUserSearchWhere(query.search);
    const total = await this.prisma.user.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    const users = await this.prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        staffInfo: { select: { id: true } },
        studentInfo: { select: { id: true } },
      },
    });

    return {
      data: users.map((user) => {
        const { staffInfo, studentInfo, ...safeUser } = user;

        return {
          ...this.sanitizeUser(safeUser),
          fullName: getPreferredUserFullName(user) ?? null,
          staffInfo: staffInfo ? { id: staffInfo.id } : null,
          studentInfo: studentInfo ? { id: studentInfo.id } : null,
        };
      }),
      meta: { total, page: safePage, limit },
    };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        staffInfo: { select: { id: true, roles: true } },
        studentInfo: { select: { id: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.serializeUserDetail(user);
  }

  async createUser(data: AdminCreateUserDto, auditActor?: ActionHistoryActor) {
    const nextRoleType = data.roleType ?? UserRole.guest;
    if (nextRoleType === UserRole.student && !getUserFullNameFromParts(data)) {
      throw new BadRequestException('Vui lòng nhập tên học sinh.');
    }

    const response =
      await this.authService.createPendingUserWithVerificationEmail(data, {
        auditActor,
        createDescription: 'Tạo người dùng từ trang quản trị',
        updateDescription: 'Cập nhật user pending từ trang quản trị',
        successMessage: 'Tạo user thành công. Email xác thực đã được gửi.',
      });

    if (nextRoleType === UserRole.guest) {
      return response;
    }

    const createdUser = await this.prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });

    if (!createdUser) {
      throw new InternalServerErrorException(
        'Không tìm thấy user vừa tạo để cập nhật phân quyền.',
      );
    }

    await this.updateUser(
      {
        id: createdUser.id,
        roleType: nextRoleType,
        ...(nextRoleType === UserRole.staff && data.staffRoles
          ? { staffRoles: data.staffRoles }
          : {}),
      },
      auditActor,
    );

    return response;
  }

  async createStudentUser(
    data: AdminCreateStudentUserDto,
    auditActor?: ActionHistoryActor,
  ) {
    const classIds = Array.from(new Set(data.class_ids));
    if (classIds.length > 0) {
      const classes = await this.prisma.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true },
      });
      if (classes.length !== classIds.length) {
        throw new NotFoundException('One or more classes not found');
      }
    }

    const response =
      await this.authService.createPendingUserWithVerificationEmail(data, {
        auditActor,
        createDescription: 'Tạo học sinh đầy đủ từ trang quản trị',
        updateDescription: 'Cập nhật user pending từ luồng tạo học sinh',
        successMessage: 'Tạo học sinh thành công. Email xác thực đã được gửi.',
      });

    const createdUser = await this.prisma.user.findUnique({
      where: { email: data.email },
      include: { studentInfo: { select: { id: true } } },
    });

    if (!createdUser) {
      throw new InternalServerErrorException(
        'Không tìm thấy user vừa tạo để cập nhật hồ sơ học sinh.',
      );
    }

    try {
      await this.withEntityIdRetry(() =>
        this.prisma.$transaction(async (tx) => {
          const beforeUserValue = await this.getUserAuditSnapshot(
            tx,
            createdUser.id,
          );
          if (!beforeUserValue) {
            throw new NotFoundException('User not found');
          }
          const beforeStudentValue = createdUser.studentInfo
            ? await this.getStudentAuditSnapshot(tx, createdUser.studentInfo.id)
            : null;

          await tx.user.update({
            where: { id: createdUser.id },
            data: { roleType: UserRole.student },
          });

          const fullName =
            `${data.last_name ?? ''} ${data.first_name ?? ''}`.trim() ||
            this.getPreferredProfileFullName(createdUser);

          const profileData: Omit<
            Prisma.StudentInfoUncheckedCreateInput,
            'id'
          > = {
            fullName,
            email: data.email,
            school: normalizeOptionalText(data.school),
            province: normalizeOptionalText(data.province),
            birthYear: data.birth_year,
            parentName: normalizeOptionalText(data.parent_name),
            parentPhone: normalizeOptionalText(data.parent_phone),
            status: data.status,
            gender: data.gender,
            goal: normalizeOptionalText(data.goal),
            userId: createdUser.id,
          };

          const student = createdUser.studentInfo
            ? await tx.studentInfo.update({
                where: { id: createdUser.studentInfo.id },
                data: profileData,
              })
            : await tx.studentInfo.create({
                data: { ...profileData, id: generateStudentId() },
              });

          const existingMemberships = await tx.studentClass.findMany({
            where: { studentId: student.id },
            select: { classId: true },
          });
          const existingClassIdSet = new Set(
            existingMemberships.map((membership) => membership.classId),
          );
          const normalizedClassIds = Array.from(new Set(classIds));
          const nextClassIdSet = new Set(normalizedClassIds);
          const classIdsToInactive = existingMemberships
            .map((membership) => membership.classId)
            .filter((classId) => !nextClassIdSet.has(classId));
          const classIdsToActivate = normalizedClassIds.filter((classId) =>
            existingClassIdSet.has(classId),
          );
          const classIdsToCreate = normalizedClassIds.filter(
            (classId) => !existingClassIdSet.has(classId),
          );

          if (classIdsToInactive.length > 0) {
            await tx.studentClass.updateMany({
              where: {
                studentId: student.id,
                classId: { in: classIdsToInactive },
              },
              data: { status: StudentClassStatus.inactive },
            });
          }

          if (classIdsToActivate.length > 0) {
            await tx.studentClass.updateMany({
              where: {
                studentId: student.id,
                classId: { in: classIdsToActivate },
              },
              data: {
                status: StudentClassStatus.active,
                customStudentTuitionPerSession: null,
                customTuitionPackageTotal: null,
                customTuitionPackageSession: null,
              },
            });
          }

          if (classIdsToCreate.length > 0) {
            await tx.studentClass.createMany({
              data: classIdsToCreate.map((classId) => ({
                classId,
                studentId: student.id,
                status: StudentClassStatus.active,
              })),
            });
          }

          if (auditActor) {
            const afterUserValue = await this.getUserAuditSnapshot(
              tx,
              createdUser.id,
            );
            if (afterUserValue) {
              await this.actionHistoryService.recordUpdate(tx, {
                actor: auditActor,
                entityType: 'user',
                entityId: createdUser.id,
                description: 'Tạo user học sinh với hồ sơ đầy đủ',
                beforeValue: beforeUserValue,
                afterValue: afterUserValue,
              });
            }

            const afterStudentValue = await this.getStudentAuditSnapshot(
              tx,
              student.id,
            );
            if (afterStudentValue) {
              if (createdUser.studentInfo && beforeStudentValue) {
                await this.actionHistoryService.recordUpdate(tx, {
                  actor: auditActor,
                  entityType: 'student',
                  entityId: student.id,
                  description: 'Cập nhật hồ sơ học sinh khi tạo user',
                  beforeValue: beforeStudentValue,
                  afterValue: afterStudentValue,
                });
              } else {
                await this.actionHistoryService.recordCreate(tx, {
                  actor: auditActor,
                  entityType: 'student',
                  entityId: student.id,
                  description: 'Tạo hồ sơ học sinh đầy đủ từ trang quản trị',
                  afterValue: afterStudentValue,
                });
              }
            }
          }
        }),
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Email or account handle already exists');
      }
      throw error;
    }

    this.authService.invalidateAuthIdentityCache(createdUser.id);
    return response;
  }

  async updateUser(data: UpdateUserDto, auditActor?: ActionHistoryActor) {
    const existingUser = await this.getUserAuditSnapshot(this.prisma, data.id);

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const nextRoleType = data.roleType ?? existingUser.roleType;
    const normalizedStaffRoles = this.normalizeStaffRoles(data.staffRoles);
    const updateData: Prisma.UserUpdateInput = {};

    if (data.email !== undefined) {
      const normalizedEmail = data.email.trim();
      updateData.email = normalizedEmail;
      if (
        normalizedEmail.toLowerCase() !== existingUser.email.toLowerCase() &&
        data.emailVerified === undefined
      ) {
        updateData.emailVerified = false;
      }
    }
    if (data.first_name !== undefined) updateData.first_name = data.first_name;
    if (data.last_name !== undefined) updateData.last_name = data.last_name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.roleType !== undefined) updateData.roleType = data.roleType;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.linkId !== undefined) updateData.linkId = data.linkId;
    if (data.province !== undefined) updateData.province = data.province;
    if (data.accountHandle !== undefined)
      updateData.accountHandle = data.accountHandle;
    if (data.emailVerified !== undefined)
      updateData.emailVerified = data.emailVerified;
    if (data.phoneVerified !== undefined)
      updateData.phoneVerified = data.phoneVerified;

    try {
      const updatedUser = await this.withEntityIdRetry(() =>
        this.prisma.$transaction(async (tx) => {
          const updatedUser = await tx.user.update({
            where: { id: data.id },
            data: updateData,
          });

          if (nextRoleType === UserRole.staff) {
            if (!existingUser.staffInfo) {
              const createdStaff = await tx.staffInfo.create({
                data: {
                  id: generateStaffId(),
                  cccdNumber: await this.generateAutoStaffCccdNumber(tx),
                  roles: normalizedStaffRoles ?? [],
                  userId: data.id,
                },
              });

              if (auditActor) {
                const afterStaffValue = await this.getStaffAuditSnapshot(
                  tx,
                  createdStaff.id,
                );
                if (afterStaffValue) {
                  await this.actionHistoryService.recordCreate(tx, {
                    actor: auditActor,
                    entityType: 'staff',
                    entityId: createdStaff.id,
                    description:
                      'Tự động tạo hồ sơ nhân sự khi cập nhật phân quyền user',
                    afterValue: afterStaffValue,
                  });
                }
              }
            } else if (normalizedStaffRoles !== undefined) {
              await tx.staffInfo.update({
                where: { id: existingUser.staffInfo.id },
                data: {
                  roles: normalizedStaffRoles,
                },
              });

              if (auditActor) {
                const afterStaffValue = await this.getStaffAuditSnapshot(
                  tx,
                  existingUser.staffInfo.id,
                );
                if (afterStaffValue) {
                  await this.actionHistoryService.recordUpdate(tx, {
                    actor: auditActor,
                    entityType: 'staff',
                    entityId: existingUser.staffInfo.id,
                    description: 'Cập nhật staff roles từ tab phân quyền user',
                    beforeValue: existingUser.staffInfo,
                    afterValue: afterStaffValue,
                  });
                }
              }
            }
          }

          if (nextRoleType === UserRole.student && !existingUser.studentInfo) {
            const createdStudent = await tx.studentInfo.create({
              data: {
                id: generateStudentId(),
                fullName: this.getPreferredProfileFullName(updatedUser),
                email: updatedUser.email,
                province: normalizeOptionalText(updatedUser.province),
                userId: data.id,
              },
            });

            if (auditActor) {
              const afterStudentValue = await this.getStudentAuditSnapshot(
                tx,
                createdStudent.id,
              );
              if (afterStudentValue) {
                await this.actionHistoryService.recordCreate(tx, {
                  actor: auditActor,
                  entityType: 'student',
                  entityId: createdStudent.id,
                  description:
                    'Tự động tạo hồ sơ học sinh khi cập nhật phân quyền user',
                  afterValue: afterStudentValue,
                });
              }
            }
          }

          if (
            existingUser.studentInfo &&
            (data.first_name !== undefined ||
              data.last_name !== undefined ||
              data.email !== undefined)
          ) {
            const studentUpdateData: Prisma.StudentInfoUpdateInput = {
              fullName: this.getPreferredProfileFullName(updatedUser),
            };
            if (data.email !== undefined) {
              studentUpdateData.email = updatedUser.email;
            }
            await tx.studentInfo.update({
              where: { id: existingUser.studentInfo.id },
              data: studentUpdateData,
            });

            if (auditActor) {
              const beforeStudentValue = await this.getStudentAuditSnapshot(
                tx,
                existingUser.studentInfo.id,
              );
              const afterStudentValue = await this.getStudentAuditSnapshot(
                tx,
                existingUser.studentInfo.id,
              );
              if (beforeStudentValue && afterStudentValue) {
                await this.actionHistoryService.recordUpdate(tx, {
                  actor: auditActor,
                  entityType: 'student',
                  entityId: existingUser.studentInfo.id,
                  description:
                    'Đồng bộ hồ sơ học sinh khi cập nhật thông tin user',
                  beforeValue: beforeStudentValue,
                  afterValue: afterStudentValue,
                });
              }
            }
          }

          const afterValue = await this.getUserAuditSnapshot(tx, data.id);
          if (!afterValue) {
            throw new NotFoundException('User not found');
          }

          if (auditActor) {
            await this.actionHistoryService.recordUpdate(tx, {
              actor: auditActor,
              entityType: 'user',
              entityId: data.id,
              description: 'Cập nhật người dùng',
              beforeValue: existingUser,
              afterValue,
            });
          }

          return this.serializeUserDetail(afterValue);
        }),
      );

      this.authService.invalidateAuthIdentityCache(data.id);
      return updatedUser;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Email or account handle already exists');
      }

      if (this.isNotFoundError(error)) {
        throw new NotFoundException('User not found');
      }

      throw error;
    }
  }

  async deleteUser(id: string, auditActor?: ActionHistoryActor) {
    if (auditActor?.userId === id) {
      throw new BadRequestException('Không thể xóa tài khoản đang đăng nhập.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        staffInfo: { select: { id: true } },
        studentInfo: { select: { id: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const preservedStaffInfoId = user.staffInfo?.id ?? null;
    const preservedStudentInfoId = user.studentInfo?.id ?? null;

    try {
      const deletedUser = await this.prisma.$transaction(async (tx) => {
        if (preservedStaffInfoId) {
          await tx.staffInfo.update({
            where: { id: preservedStaffInfoId },
            data: { userId: null },
          });
        }

        if (preservedStudentInfoId) {
          await tx.studentInfo.update({
            where: { id: preservedStudentInfoId },
            data: { userId: null },
          });
        }

        const deletedUser = await tx.user.delete({
          where: { id },
        });

        if (auditActor) {
          const { staffInfo, studentInfo, ...beforeValue } = user;
          void staffInfo;
          void studentInfo;
          await this.actionHistoryService.recordDelete(tx, {
            actor: auditActor,
            entityType: 'user',
            entityId: id,
            description:
              preservedStaffInfoId || preservedStudentInfoId
                ? 'Xóa tài khoản user (giữ lại hồ sơ nhân sự/học sinh liên kết)'
                : 'Xóa người dùng',
            beforeValue: {
              ...beforeValue,
              preservedStaffInfoId,
              preservedStudentInfoId,
            },
          });
        }

        return this.sanitizeUser(deletedUser);
      });

      this.authService.invalidateAuthIdentityCache(id);
      return deletedUser;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundException('User not found');
      }

      throw error;
    }
  }

  /** Get full profile (user + staffInfo + studentInfo) for current user. */
  async getFullProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        staffInfo: true,
        studentInfo: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const profile = await this.attachProfileMediaUrls(this.sanitizeUser(user));
    const dataConsentAcceptedAt =
      profile.dataProcessingConsentAcceptedAt ?? null;
    const dataConsentVersion = profile.dataProcessingConsentVersion ?? null;

    return {
      ...profile,
      dataConsentAcceptedAt,
      dataConsentVersion,
      requiresStaffDataConsent: Boolean(
        profile.staffInfo?.id &&
        (!dataConsentAcceptedAt ||
          dataConsentVersion !== STAFF_DATA_CONSENT_VERSION),
      ),
    };
  }

  async getLinkedStaffId(userId: string): Promise<string> {
    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (!staff) {
      throw new BadRequestException('User has no linked staff record');
    }

    return staff.id;
  }

  async getLinkedStudentId(userId: string): Promise<string> {
    const student = await this.prisma.studentInfo.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!student) {
      throw new BadRequestException('User has no linked student record');
    }

    return student.id;
  }

  /** Update current user's basic info (self). */
  async updateMyProfile(
    userId: string,
    dto: UpdateMyProfileDto,
    auditActor?: ActionHistoryActor,
  ) {
    const existing = await this.getUserAuditSnapshot(this.prisma, userId);
    if (!existing) {
      throw new UnauthorizedException('User not found');
    }
    const data: Record<string, unknown> = {};
    if (dto.first_name !== undefined) data.first_name = dto.first_name;
    if (dto.last_name !== undefined) data.last_name = dto.last_name;
    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.trim();
      if (!normalizedEmail) {
        throw new BadRequestException('Email không hợp lệ');
      }

      data.email = normalizedEmail;
      if (normalizedEmail.toLowerCase() !== existing.email.toLowerCase()) {
        data.emailVerified = false;
      }
    }
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.province !== undefined) data.province = dto.province;
    if (dto.accountHandle !== undefined) data.accountHandle = dto.accountHandle;
    if (Object.keys(data).length === 0) {
      return this.getFullProfile(userId);
    }
    try {
      const updatedProfile = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: data as Parameters<typeof this.prisma.user.update>[0]['data'],
        });

        if (auditActor) {
          const afterValue = await this.getUserAuditSnapshot(tx, userId);
          if (afterValue) {
            await this.actionHistoryService.recordUpdate(tx, {
              actor: auditActor,
              entityType: 'user',
              entityId: userId,
              description: 'Cập nhật hồ sơ người dùng',
              beforeValue: existing,
              afterValue,
            });
          }
        }

        const updatedProfile = await tx.user.findUnique({
          where: { id: userId },
          include: {
            staffInfo: true,
            studentInfo: true,
          },
        });
        if (!updatedProfile) {
          throw new UnauthorizedException('User not found');
        }
        return this.sanitizeUser(updatedProfile);
      });

      this.authService.invalidateAuthIdentityCache(userId);
      return this.attachProfileMediaUrls(updatedProfile);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Email hoặc account handle đã tồn tại');
      }
      throw error;
    }
  }

  async uploadMyAvatar(
    userId: string,
    file: UploadableFile | undefined,
    auditActor?: ActionHistoryActor,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh đại diện để tải lên.');
    }

    this.validateAvatarImageFile(file);

    const existing = await this.getUserAuditSnapshot(this.prisma, userId);
    if (!existing) {
      throw new UnauthorizedException('User not found');
    }

    const avatarPath = this.buildAvatarStoragePath(userId);
    const supabase = getSupabaseAdminClient();
    const uploadResult = await supabase.storage
      .from(AVATAR_STORAGE_BUCKET)
      .upload(avatarPath, file.buffer, {
        upsert: true,
        contentType: file.mimetype,
      });

    if (uploadResult.error) {
      throw new BadRequestException(
        uploadResult.error.message || 'Không thể tải ảnh đại diện lên.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { avatarPath },
      });

      if (auditActor) {
        const afterValue = await this.getUserAuditSnapshot(tx, userId);
        if (afterValue) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'user',
            entityId: userId,
            description: 'Cập nhật ảnh đại diện',
            beforeValue: existing,
            afterValue,
          });
        }
      }
    });

    this.authService.invalidateAuthIdentityCache(userId);
    return this.getFullProfile(userId);
  }

  async deleteMyAvatar(userId: string, auditActor?: ActionHistoryActor) {
    const existing = await this.getUserAuditSnapshot(this.prisma, userId);
    if (!existing) {
      throw new UnauthorizedException('User not found');
    }

    if (!existing.avatarPath) {
      return this.getFullProfile(userId);
    }

    const supabase = getSupabaseAdminClient();
    const deleteResult = await supabase.storage
      .from(AVATAR_STORAGE_BUCKET)
      .remove([existing.avatarPath]);

    if (deleteResult.error) {
      throw new BadRequestException(
        deleteResult.error.message || 'Không thể xoá ảnh đại diện hiện tại.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { avatarPath: null },
      });

      if (auditActor) {
        const afterValue = await this.getUserAuditSnapshot(tx, userId);
        if (afterValue) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'user',
            entityId: userId,
            description: 'Xoá ảnh đại diện',
            beforeValue: existing,
            afterValue,
          });
        }
      }
    });

    this.authService.invalidateAuthIdentityCache(userId);
    return this.getFullProfile(userId);
  }

  /** Update current user's staff record (self). */
  async updateMyStaffProfile(
    userId: string,
    dto: UpdateMyStaffProfileDto,
    auditActor?: ActionHistoryActor,
  ) {
    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId },
    });
    if (!staff) {
      throw new BadRequestException('User has no linked staff record');
    }
    const userNameData = this.normalizeSelfStaffNameInput(dto);
    const data: Record<string, unknown> = {};
    if (dto.cccd_number !== undefined) data.cccdNumber = dto.cccd_number;
    if (dto.ethnicity !== undefined) data.ethnicity = dto.ethnicity;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.current_address !== undefined)
      data.currentAddress = dto.current_address;
    if (dto.cccd_issued_date !== undefined) {
      const cccdIssuedDate = new Date(dto.cccd_issued_date);
      data.cccdIssuedDate = Number.isNaN(cccdIssuedDate.getTime())
        ? undefined
        : cccdIssuedDate;
    }
    if (dto.cccd_issued_place !== undefined)
      data.cccdIssuedPlace = dto.cccd_issued_place;
    if (dto.birth_date !== undefined) {
      const d = new Date(dto.birth_date);
      data.birthDate = Number.isNaN(d.getTime()) ? undefined : d;
    }
    if (dto.university !== undefined) data.university = dto.university;
    if (dto.high_school !== undefined) data.highSchool = dto.high_school;
    if (dto.specialization !== undefined)
      data.specialization = dto.specialization;
    if (dto.bank_account !== undefined) data.bankAccount = dto.bank_account;
    if (dto.bank_qr_link !== undefined) {
      data.bankQrLink = normalizeHttpHttpsUrl(
        dto.bank_qr_link,
        'Link QR ngân hàng',
      );
    }
    if (dto.personal_achievement_link !== undefined) {
      data.personalAchievementLink = normalizeHttpHttpsUrl(
        dto.personal_achievement_link,
        'Link thành tích cá nhân',
      );
    }
    if (
      Object.keys(data).length === 0 &&
      Object.keys(userNameData).length === 0
    ) {
      return this.getFullProfile(userId);
    }
    const beforeStaffValue = auditActor
      ? await this.getStaffAuditSnapshot(this.prisma, staff.id)
      : null;
    const beforeUserValue = auditActor
      ? await this.getUserAuditSnapshot(this.prisma, userId)
      : null;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userNameData).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userNameData,
        });
      }

      if (Object.keys(data).length > 0) {
        await tx.staffInfo.update({
          where: { id: staff.id },
          data: data as Parameters<
            typeof this.prisma.staffInfo.update
          >[0]['data'],
        });
      }

      if (auditActor) {
        const afterUserValue = await this.getUserAuditSnapshot(tx, userId);
        if (
          beforeUserValue &&
          afterUserValue &&
          Object.keys(userNameData).length > 0
        ) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'user',
            entityId: userId,
            description: 'Cập nhật tên nhân sự từ hồ sơ tự phục vụ',
            beforeValue: beforeUserValue,
            afterValue: afterUserValue,
          });
        }

        const afterStaffValue = await this.getStaffAuditSnapshot(tx, staff.id);
        if (
          beforeStaffValue &&
          afterStaffValue &&
          Object.keys(data).length > 0
        ) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'staff',
            entityId: staff.id,
            description: 'Cập nhật hồ sơ nhân sự',
            beforeValue: beforeStaffValue,
            afterValue: afterStaffValue,
          });
        }
      }
    });

    if (Object.keys(userNameData).length > 0) {
      this.authService.invalidateAuthIdentityCache(userId);
    }

    return this.getFullProfile(userId);
  }

  /** Update current user's student record (self). */
  async updateMyStudentProfile(
    userId: string,
    dto: UpdateMyStudentProfileDto,
    auditActor?: ActionHistoryActor,
  ) {
    const student = await this.prisma.studentInfo.findFirst({
      where: { userId },
    });
    if (!student) {
      throw new BadRequestException('User has no linked student record');
    }
    const data: Record<string, unknown> = {};
    if (dto.full_name !== undefined) data.fullName = dto.full_name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.school !== undefined) data.school = dto.school;
    if (dto.province !== undefined) data.province = dto.province;
    if (dto.birth_year !== undefined) data.birthYear = dto.birth_year;
    if (dto.parent_name !== undefined) data.parentName = dto.parent_name;
    if (dto.parent_phone !== undefined) data.parentPhone = dto.parent_phone;
    if (dto.parent_email !== undefined) {
      if (dto.parent_email === null) {
        data.parentEmail = null;
      } else {
        const trimmed = dto.parent_email.trim();
        data.parentEmail = trimmed ? trimmed : null;
      }
    }
    if (dto.parent_receipt_email_enabled !== undefined) {
      data.parentReceiptEmailEnabled = dto.parent_receipt_email_enabled;
    }
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.goal !== undefined) data.goal = dto.goal;
    if (Object.keys(data).length === 0) {
      return this.getFullProfile(userId);
    }
    const beforeValue = auditActor
      ? await this.getStudentAuditSnapshot(this.prisma, student.id)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.studentInfo.update({
        where: { id: student.id },
        data: data as Parameters<
          typeof this.prisma.studentInfo.update
        >[0]['data'],
      });

      if (auditActor) {
        const afterValue = await this.getStudentAuditSnapshot(tx, student.id);
        if (beforeValue && afterValue) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'student',
            entityId: student.id,
            description: 'Cập nhật hồ sơ học sinh',
            beforeValue,
            afterValue,
          });
        }
      }
    });

    return this.getFullProfile(userId);
  }
}
