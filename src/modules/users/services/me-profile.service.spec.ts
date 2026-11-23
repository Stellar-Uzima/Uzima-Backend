import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';
import { MeProfileService } from './me-profile.service';
import { User } from '../../../entities/user.entity';
import { UpdateMeProfileDto } from '../dto/update-me-profile.dto';

/** In-memory stand-in for the TypeORM user repository. */
class FakeUserRepository {
  rows = new Map<string, User>();
  saveCount = 0;

  create(partial: Partial<User>): User {
    return partial as User;
  }

  async findOne({ where }: { where: Partial<User> }): Promise<User | null> {
    for (const row of this.rows.values()) {
      if (where.id && row.id !== where.id) continue;
      if (where.phoneNumber && row.phoneNumber !== where.phoneNumber) continue;
      if (where.avatar && row.avatar !== where.avatar) continue;
      return row;
    }
    return null;
  }

  async save(user: User): Promise<User> {
    this.saveCount += 1;
    this.rows.set(user.id, user);
    return user;
  }
}

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'user-1',
    email: 'amina@example.com',
    firstName: 'Amina',
    lastName: 'Okonkwo',
    fullName: 'Amina Okonkwo',
    phoneNumber: null,
    avatar: null,
    role: 'USER',
    status: 'active',
    isVerified: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

function makeService(seed: User[] = [makeUser()]) {
  const repo = new FakeUserRepository();
  seed.forEach((row) => repo.rows.set(row.id, row));
  return {
    repo,
    service: new MeProfileService(repo as unknown as Repository<User>),
  };
}

describe('MeProfileService (#1290)', () => {
  it('returns the caller profile', async () => {
    const { service } = makeService();
    const result = await service.getMe('user-1');

    expect(result.id).toBe('user-1');
    expect(result.email).toBe('amina@example.com');
    expect(result.fullName).toBe('Amina Okonkwo');
  });

  it('throws NotFound for an unknown account', async () => {
    const { service } = makeService();
    await expect(service.getMe('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persists name changes and recomputes fullName', async () => {
    const { service, repo } = makeService();
    const result = await service.updateMe('user-1', {
      firstName: 'Fatima',
      lastName: 'Bello',
    });

    expect(result.firstName).toBe('Fatima');
    expect(result.lastName).toBe('Bello');
    expect(result.fullName).toBe('Fatima Bello');
    expect(repo.rows.get('user-1')?.fullName).toBe('Fatima Bello');
  });

  it('recomputes fullName when only one part changes', async () => {
    const { service } = makeService();
    const result = await service.updateMe('user-1', { firstName: 'Zainab' });
    expect(result.fullName).toBe('Zainab Okonkwo');
  });

  it('does not write when nothing was supplied', async () => {
    const { service, repo } = makeService();
    const result = await service.updateMe('user-1', {});

    expect(repo.saveCount).toBe(0);
    expect(result.id).toBe('user-1');
  });

  it('rejects a protected field even when the service is called directly', async () => {
    const { service } = makeService();
    const dto = { role: 'ADMIN' } as unknown as UpdateMeProfileDto;

    await expect(service.updateMe('user-1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects privilege-escalating fields by name in the message', async () => {
    const { service } = makeService();
    const dto = { isVerified: true, status: 'active' } as unknown as UpdateMeProfileDto;

    try {
      await service.updateMe('user-1', dto);
      fail('expected BadRequestException');
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as string;
      expect(response).toContain('isVerified');
      expect(response).toContain('status');
    }
  });

  it('rejects a blank name', async () => {
    const { service } = makeService();
    await expect(service.updateMe('user-1', { firstName: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('persists a new phone number', async () => {
    const { service } = makeService();
    const result = await service.updateMe('user-1', { phoneNumber: '+2348012345678' });
    expect(result.phoneNumber).toBe('+2348012345678');
  });

  it('rejects a phone number owned by another account', async () => {
    const other = makeUser({ id: 'user-2', phoneNumber: '+2348012345678' });
    const { service } = makeService([makeUser(), other]);

    await expect(
      service.updateMe('user-1', { phoneNumber: '+2348012345678' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a user to keep their existing phone number', async () => {
    const me = makeUser({ phoneNumber: '+2348012345678' });
    const { service } = makeService([me]);

    const result = await service.updateMe('user-1', { phoneNumber: '+2348012345678' });
    expect(result.phoneNumber).toBe('+2348012345678');
  });

  describe('avatar metadata (#1483)', () => {
    const AVATAR_REF = '/uploads/avatars/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b-amina.jpg';

    it('persists a valid avatar storage reference and returns it', async () => {
      const { service } = makeService();
      const result = await service.updateMe('user-1', { avatar: AVATAR_REF });
      expect(result.avatar).toBe(AVATAR_REF);

      const read = await service.getMe('user-1');
      expect(read.avatar).toBe(AVATAR_REF);
    });

    it('returns null avatar when none is stored', async () => {
      const { service } = makeService();
      const result = await service.getMe('user-1');
      expect(result.avatar).toBeNull();
    });

    it('clears the avatar when null is sent', async () => {
      const { service, repo } = makeService([makeUser({ avatar: AVATAR_REF })]);
      const result = await service.updateMe('user-1', { avatar: null });
      expect(result.avatar).toBeNull();
      expect(repo.rows.get('user-1')!.avatar).toBeNull();
    });

    it.each([
      ['an external URL', 'https://cdn.example.com/a.png'],
      ['another storage folder', '/uploads/exports/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b-x.json'],
      ['a path traversal', '/uploads/avatars/../exports/user-2/data.json'],
      ['a reference without a uuid', '/uploads/avatars/amina.jpg'],
    ])('rejects %s with 400', async (_label, avatar) => {
      const { service, repo } = makeService();
      await expect(service.updateMe('user-1', { avatar })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.saveCount).toBe(0);
    });

    it("rejects another account's avatar with 403", async () => {
      const { service, repo } = makeService([
        makeUser(),
        makeUser({ id: 'user-2', email: 'b@example.com', avatar: AVATAR_REF }),
      ]);
      await expect(service.updateMe('user-1', { avatar: AVATAR_REF })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.saveCount).toBe(0);
    });

    it('lets a user re-submit their own current avatar', async () => {
      const { service } = makeService([makeUser({ avatar: AVATAR_REF })]);
      const result = await service.updateMe('user-1', { avatar: AVATAR_REF });
      expect(result.avatar).toBe(AVATAR_REF);
    });
  });

  describe('UpdateMeProfileDto avatar validation (#1483)', () => {
    const validateAvatar = async (avatar: unknown) => {
      const dto = plainToInstance(UpdateMeProfileDto, { avatar });
      return { dto, errors: await validate(dto) };
    };

    it('accepts a valid storage reference', async () => {
      const { errors } = await validateAvatar(
        '/uploads/avatars/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b-amina.jpg',
      );
      expect(errors).toHaveLength(0);
    });

    it('accepts null and turns an empty string into null (clear)', async () => {
      expect((await validateAvatar(null)).errors).toHaveLength(0);
      const empty = await validateAvatar('   ');
      expect(empty.errors).toHaveLength(0);
      expect(empty.dto.avatar).toBeNull();
    });

    it('rejects an external URL', async () => {
      const { errors } = await validateAvatar('https://cdn.example.com/a.png');
      expect(errors.map((e) => e.property)).toContain('avatar');
    });
  });
});
