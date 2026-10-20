import { NotFoundException } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from '../entities/user.entity';
import { WalletService } from '../modules/wallet/wallet.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../audit/entities/audit-log.entity';
import {
  RewardCatalog,
  RewardCatalogStatus,
  RewardType,
} from './entities/reward-catalog.entity';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { RewardCatalogService } from './reward-catalog.service';

describe('RewardCatalogService inventory, expiry and administration', () => {
  let service: RewardCatalogService;
  let catalogRow: RewardCatalog;

  const eventEmitter = { emit: jest.fn() };
  const auditService = { logEvent: jest.fn() };
  const catalogRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const rewardRepository = {};
  const userRepository = { findOne: jest.fn() };
  const walletService = { getWalletSummary: jest.fn() };
  const dataSource = { transaction: jest.fn() };

  const buildRow = (overrides: Partial<RewardCatalog> = {}): RewardCatalog =>
    ({
      id: 'reward-1',
      title: 'Test reward',
      description: null,
      type: RewardType.XLM,
      cost: 2,
      stock: 3,
      redeemedCount: 0,
      status: RewardCatalogStatus.ACTIVE,
      metadata: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as RewardCatalog;

  beforeEach(async () => {
    jest.clearAllMocks();
    catalogRow = buildRow();

    dataSource.transaction.mockImplementation(async (work: any) =>
      work({
        getRepository: (entity: unknown) => {
          if (entity === RewardCatalog) {
            return {
              findOne: jest.fn(async () => catalogRow),
              save: jest.fn(async (row: RewardCatalog) => row),
            };
          }
          throw new Error('Unexpected repository');
        },
      }),
    );
    catalogRepository.findOne.mockResolvedValue(catalogRow);
    catalogRepository.save.mockImplementation(async (row: RewardCatalog) => row);
    auditService.logEvent.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardCatalogService,
        { provide: getRepositoryToken(RewardCatalog), useValue: catalogRepository },
        { provide: getRepositoryToken(RewardTransaction), useValue: rewardRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: WalletService, useValue: walletService },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(RewardCatalogService);
  });

  it('reserves stock under a lock and emits reward.catalog.stock_changed', async () => {
    const result = await service.reserveStock('reward-1', 1, 'admin-1');

    expect(result.stock).toBe(2);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith('reward.catalog.stock_changed', {
      catalogId: 'reward-1',
      stock: 2,
      changedBy: 'admin-1',
    });
  });

  it('rejects a reservation when stock would go below zero', async () => {
    catalogRow = buildRow({ stock: 0 });

    await expect(service.reserveStock('reward-1')).rejects.toThrow('OUT_OF_STOCK');
    expect(catalogRow.stock).toBe(0);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('never decrements unlimited stock and emits no stock change', async () => {
    catalogRow = buildRow({ stock: -1 });

    const result = await service.reserveStock('reward-1');

    expect(result.stock).toBe(-1);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('rejects a reservation for an expired reward with REWARD_EXPIRED', async () => {
    catalogRow = buildRow({ expiresAt: new Date(Date.now() - 60_000) });

    await expect(service.reserveStock('reward-1')).rejects.toThrow('REWARD_EXPIRED');
    expect(catalogRow.stock).toBe(3);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('rejects a reservation for a non-active reward', async () => {
    catalogRow = buildRow({ status: RewardCatalogStatus.ARCHIVED });

    await expect(service.reserveStock('reward-1')).rejects.toThrow(
      'Reward is not available for redemption',
    );
    expect(catalogRow.stock).toBe(3);
  });

  it('rejects a reservation when the reward no longer exists', async () => {
    catalogRepository.findOne.mockResolvedValue(null);
    const missing = buildRow({ id: 'missing' });
    catalogRow = missing;
    dataSource.transaction.mockImplementation(async (work: any) =>
      work({
        getRepository: () => ({
          findOne: jest.fn(async () => null),
          save: jest.fn(async (row: RewardCatalog) => row),
        }),
      }),
    );

    await expect(service.reserveStock('missing')).rejects.toThrow(NotFoundException);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('releases stock back to the catalog and emits the change', async () => {
    catalogRow = buildRow({ stock: 1 });

    const result = await service.releaseStock('reward-1', 2, 'admin-1');

    expect(result.stock).toBe(3);
    expect(eventEmitter.emit).toHaveBeenCalledWith('reward.catalog.stock_changed', {
      catalogId: 'reward-1',
      stock: 3,
      changedBy: 'admin-1',
    });
  });

  it('archives instead of deleting a reward and audits the mutation', async () => {
    await service.delete('reward-1', { userId: 'admin-1', userRole: 'ADMIN' });

    expect(catalogRow.status).toBe(RewardCatalogStatus.ARCHIVED);
    expect(catalogRepository.save).toHaveBeenCalledWith(catalogRow);
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        userRole: 'ADMIN',
        action: AuditAction.DELETE,
        resourceType: AuditResource.REWARD,
        resourceId: 'reward-1',
      }),
    );
  });

  it('creates a reward, audits it and announces the initial stock', async () => {
    catalogRepository.create.mockImplementation((input: Partial<RewardCatalog>) =>
      buildRow(input),
    );

    const created = await service.create(
      {
        title: 'New reward',
        type: RewardType.BADGE,
        cost: 5,
        stock: 4,
      },
      { userId: 'admin-1', userRole: 'ADMIN' },
    );

    expect(created.status).toBe(RewardCatalogStatus.ACTIVE);
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: AuditAction.CREATE,
        resourceType: AuditResource.REWARD,
        resourceId: created.id,
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith('reward.catalog.stock_changed', {
      catalogId: created.id,
      stock: 4,
      changedBy: 'admin-1',
    });
  });

  it('marks expired rows in the admin list', async () => {
    const expiredRow = buildRow({ id: 'reward-expired', expiresAt: new Date(Date.now() - 1000) });
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[expiredRow, catalogRow], 2]),
    };
    catalogRepository.createQueryBuilder.mockReturnValue(qb);

    const page = await service.findAll(undefined, undefined, 1, 20);

    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(1);
    expect(page.data[0].isExpired).toBe(true);
    expect(page.data[1].isExpired).toBe(false);
  });

  it('filters the public catalog to active, non-expired rewards', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([catalogRow]),
    };
    catalogRepository.createQueryBuilder.mockReturnValue(qb);

    const rows = await service.getPublicCatalog();

    expect(qb.where).toHaveBeenCalledWith('rc.status = :status', {
      status: RewardCatalogStatus.ACTIVE,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('(rc.expiresAt IS NULL OR rc.expiresAt > NOW())');
    expect(rows).toHaveLength(1);
    expect(rows[0].stock).toBe(3);
  });
});
