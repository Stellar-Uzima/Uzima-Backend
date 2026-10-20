import { BadRequestException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { AuditAction, AuditResource } from '../audit/entities/audit-log.entity';
import { Coupon, CouponStatus } from '../entities/coupon.entity';
import { CreateCouponDto } from './dto/coupon-admin.dto';
import { CouponService } from './coupon.service';

describe('CouponService admin lifecycle', () => {
  let service: CouponService;
  let couponRepository: {
    count: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let auditService: { logEvent: jest.Mock };

  beforeEach(() => {
    couponRepository = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((coupon) => coupon),
      save: jest.fn(async (coupon) => ({ ...coupon, id: 'coupon-id' })),
    };
    auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };
    service = Object.assign(Object.create(CouponService.prototype), {
      couponRepository,
      auditService,
      logger: { log: jest.fn(), warn: jest.fn() },
    });
  });

  it('rejects coupon discounts outside the supported percentage range', async () => {
    await expect(
      service.createCoupon('user-id', { discount: 101 }, 'admin-id')
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(couponRepository.count).not.toHaveBeenCalled();
  });

  it('enforces the active coupon limit for admin creation', async () => {
    couponRepository.count.mockResolvedValue(5);

    await expect(service.createCoupon('user-id', {}, 'admin-id')).rejects.toThrow(
      'maximum of 5 active coupons'
    );
    expect(couponRepository.save).not.toHaveBeenCalled();
  });

  it('prevents reactivating a coupon when the user is at the active limit', async () => {
    couponRepository.count.mockResolvedValue(5);
    couponRepository.findOne.mockResolvedValue({
      id: 'coupon-id',
      code: 'SAVE2026',
      userId: 'user-id',
      status: CouponStatus.EXPIRED,
      expiresAt: new Date(Date.now() + 86_400_000),
      usedAt: null,
    });

    await expect(
      service.updateStatus('SAVE2026', CouponStatus.ACTIVE, 'admin-id', 'ADMIN')
    ).rejects.toThrow('maximum of 5 active coupons');
    expect(couponRepository.save).not.toHaveBeenCalled();
  });

  it('creates a validated coupon and records the creation in the audit trail', async () => {
    const coupon = await service.createCoupon(
      'user-id',
      { code: 'SAVE2026', discount: 25, daysValid: 30 },
      'admin-id',
      'ADMIN'
    );

    expect(coupon).toMatchObject({
      id: 'coupon-id',
      code: 'SAVE2026',
      discount: 25,
      status: CouponStatus.ACTIVE,
    });
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-id',
        userRole: 'ADMIN',
        action: AuditAction.CREATE,
        resourceType: AuditResource.COUPON,
        resourceName: 'SAVE2026',
      })
    );
  });

  it('records status transitions with old and new values', async () => {
    const coupon = {
      id: 'coupon-id',
      code: 'SAVE2026',
      status: CouponStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 86_400_000),
      usedAt: null,
    } as Coupon;
    couponRepository.findOne.mockResolvedValue(coupon);
    couponRepository.save.mockImplementation(async (updated) => updated);

    await service.updateStatus(coupon.code, CouponStatus.EXPIRED, 'admin-id', 'ADMIN');

    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        resourceType: AuditResource.COUPON,
        oldValues: { status: CouponStatus.ACTIVE, usedAt: null },
        newValues: { status: CouponStatus.EXPIRED, usedAt: null },
      })
    );
  });

  it('validates discount and validity limits at the request boundary', () => {
    const dto = Object.assign(new CreateCouponDto(), {
      userId: '3f15a333-ff31-4b1c-8d88-2f77d319e270',
      discount: 101,
      daysValid: 366,
    });

    const invalidProperties = validateSync(dto).map((error) => error.property);
    expect(invalidProperties).toEqual(expect.arrayContaining(['discount', 'daysValid']));
  });
});
