import { DataSource, Repository } from 'typeorm';
import { UserSeeder, usersData } from './user.seeder';
import { User } from '../../users/entities/user.entity';

jest.mock('bcryptjs', () => ({
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashedPassword'),
}));

describe('UserSeeder', () => {
  let seeder: UserSeeder;
  let mockUserRepository: Partial<Repository<User>>;

  beforeEach(() => {
    mockUserRepository = {
      count: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockUserRepository),
    } as unknown as DataSource;

    seeder = new UserSeeder(mockDataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates all seed users when no users exist', async () => {
    (mockUserRepository.count as jest.Mock).mockResolvedValue(0);
    (mockUserRepository.findOne as jest.Mock).mockResolvedValue(null);

    await seeder.seed();

    expect(mockUserRepository.count).toHaveBeenCalled();
    expect(mockUserRepository.create).toHaveBeenCalledTimes(usersData.length);
    expect(mockUserRepository.save).toHaveBeenCalledTimes(usersData.length);
  });

  it('skips seeding if users already exist', async () => {
    (mockUserRepository.count as jest.Mock).mockResolvedValue(5);

    await seeder.seed();

    expect(mockUserRepository.create).not.toHaveBeenCalled();
    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });
});
