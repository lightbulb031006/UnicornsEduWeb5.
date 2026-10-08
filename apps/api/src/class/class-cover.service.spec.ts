jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('src/storage/supabase-storage', () => ({
  createSignedStorageUrl: jest.fn(({ path }: { path?: string | null }) =>
    Promise.resolve(path ? `https://signed/${path}` : null),
  ),
  uploadStorageObject: jest.fn(() => Promise.resolve()),
  removeStorageObjects: jest.fn(() => Promise.resolve()),
  validateImageFile: jest.fn(),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffRole, UserRole } from '../../generated/enums';
import {
  removeStorageObjects,
  uploadStorageObject,
} from 'src/storage/supabase-storage';
import { ClassCoverService } from './class-cover.service';

describe('ClassCoverService', () => {
  const mockPrisma = {
    staffInfo: { findFirst: jest.fn() },
    class: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  const staffOperationsAccess = {
    resolveClassViewerActor: jest.fn(),
    resolveClassViewAccessMode: jest.fn(),
  };
  const file = {
    buffer: Buffer.from('img'),
    mimetype: 'image/webp',
    size: 3,
  };

  let service: ClassCoverService;

  const asStaff = (roles: StaffRole[], ownsClass = false) => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1', roles });
    mockPrisma.class.findFirst.mockResolvedValue(
      ownsClass ? { id: 'class-1' } : null,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      coverImagePath: null,
    });
    service = new ClassCoverService(
      mockPrisma as never,
      staffOperationsAccess as never,
    );
  });

  describe('canManage', () => {
    it('allows admin users for every class', async () => {
      await expect(
        service.canManage('u1', UserRole.admin, 'class-1'),
      ).resolves.toBe(true);
      expect(mockPrisma.staffInfo.findFirst).not.toHaveBeenCalled();
    });

    it.each([StaffRole.admin, StaffRole.assistant])(
      'allows staff role %s for every class without ownership',
      async (role) => {
        asStaff([role]);
        await expect(
          service.canManage('u1', UserRole.staff, 'class-1'),
        ).resolves.toBe(true);
        expect(mockPrisma.class.findFirst).not.toHaveBeenCalled();
      },
    );

    it('allows the active teacher or training manager of the class', async () => {
      asStaff([StaffRole.teacher], true);
      await expect(
        service.canManage('u1', UserRole.staff, 'class-1'),
      ).resolves.toBe(true);
      expect(mockPrisma.class.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'class-1',
          OR: [
            { trainingManagerStaffId: 'staff-1' },
            { teachers: { some: { teacherId: 'staff-1', status: 'active' } } },
          ],
        },
        select: { id: true },
      });
    });

    it.each([
      [StaffRole.teacher],
      [StaffRole.training],
      [StaffRole.customer_care],
      [StaffRole.accountant],
    ])('rejects %s staff who do not own the class', async (role) => {
      asStaff([role], false);
      await expect(
        service.canManage('u1', UserRole.staff, 'class-1'),
      ).resolves.toBe(false);
    });

    it('rejects users without a staff record', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue(null);
      await expect(
        service.canManage('u1', UserRole.staff, 'class-1'),
      ).resolves.toBe(false);
    });
  });

  describe('upload', () => {
    it('stores the cover, saves the path and removes a previous file with another extension', async () => {
      asStaff([StaffRole.teacher], true);
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        coverImagePath: 'class-1/cover.png',
      });

      const result = await service.upload(
        'u1',
        UserRole.staff,
        'class-1',
        file,
      );

      expect(uploadStorageObject).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'class-covers',
          path: 'class-1/cover.webp',
        }),
      );
      expect(mockPrisma.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: { coverImagePath: 'class-1/cover.webp' },
      });
      expect(removeStorageObjects).toHaveBeenCalledWith({
        bucket: 'class-covers',
        paths: ['class-1/cover.png'],
      });
      expect(result).toEqual({
        coverImageUrl: 'https://signed/class-1/cover.webp',
        canManage: true,
      });
    });

    it('blocks staff who cannot manage the class before touching storage', async () => {
      asStaff([StaffRole.teacher], false);
      await expect(
        service.upload('u1', UserRole.staff, 'class-1', file),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(uploadStorageObject).not.toHaveBeenCalled();
      expect(mockPrisma.class.update).not.toHaveBeenCalled();
    });

    it('answers 403 without looking up the class when staff cannot manage it', async () => {
      asStaff([StaffRole.teacher], false);
      await expect(
        service.upload('u1', UserRole.staff, 'missing', file),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.class.findUnique).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown class', async () => {
      mockPrisma.class.findUnique.mockResolvedValue(null);
      await expect(
        service.upload('u1', UserRole.admin, 'missing', file),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the stored file and clears the path', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        coverImagePath: 'class-1/cover.jpg',
      });
      await expect(
        service.remove('u1', UserRole.admin, 'class-1'),
      ).resolves.toEqual({ coverImageUrl: null, canManage: true });
      expect(removeStorageObjects).toHaveBeenCalledWith({
        bucket: 'class-covers',
        paths: ['class-1/cover.jpg'],
      });
      expect(mockPrisma.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: { coverImagePath: null },
      });
    });

    it('keeps the cleared path when the storage delete fails', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        coverImagePath: 'class-1/cover.jpg',
      });
      (removeStorageObjects as jest.Mock).mockRejectedValueOnce(
        new Error('storage down'),
      );
      await expect(
        service.remove('u1', UserRole.admin, 'class-1'),
      ).resolves.toEqual({ coverImageUrl: null, canManage: true });
      expect(mockPrisma.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: { coverImagePath: null },
      });
    });

    it('blocks staff who cannot manage the class', async () => {
      asStaff([StaffRole.customer_care], false);
      await expect(
        service.remove('u1', UserRole.staff, 'class-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(removeStorageObjects).not.toHaveBeenCalled();
    });
  });

  describe('getCover', () => {
    it('requires class view access for staff and reports canManage', async () => {
      staffOperationsAccess.resolveClassViewerActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.accountant],
      });
      staffOperationsAccess.resolveClassViewAccessMode.mockResolvedValue(
        'admin',
      );
      asStaff([StaffRole.accountant], false);

      await expect(
        service.getCover('u1', UserRole.staff, 'class-1'),
      ).resolves.toEqual({ coverImageUrl: null, canManage: false });
      expect(
        staffOperationsAccess.resolveClassViewAccessMode,
      ).toHaveBeenCalledWith(
        { id: 'staff-1', roles: [StaffRole.accountant] },
        'class-1',
      );
    });

    it('propagates the view check rejection', async () => {
      staffOperationsAccess.resolveClassViewerActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.teacher],
      });
      staffOperationsAccess.resolveClassViewAccessMode.mockRejectedValue(
        new NotFoundException('Class not found'),
      );
      await expect(
        service.getCover('u1', UserRole.staff, 'class-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
