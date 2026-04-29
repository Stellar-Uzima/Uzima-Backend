import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { BaseSeeder } from './base.seeder';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';

interface UserData {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  country: string;
  phoneNumber?: string;
  isVerified?: boolean;
}

export const usersData: UserData[] = [
  {
    email: 'admin@example.com',
    password: 'AdminPass123!',
    fullName: 'Admin User',
    role: Role.ADMIN,
    country: 'NG',
    phoneNumber: '+2341234567890',
    isVerified: true,
  },
  {
    email: 'healer@example.com',
    password: 'HealerPass123!',
    fullName: 'Healer User',
    role: Role.HEALER,
    country: 'KE',
    phoneNumber: '+2541234567890',
    isVerified: true,
  },
  {
    email: 'user@example.com',
    password: 'UserPass123!',
    fullName: 'Regular User',
    role: Role.USER,
    country: 'NG',
    phoneNumber: '+2349876543210',
    isVerified: true,
  },
  {
    email: 'test.user@example.com',
    password: 'TestPass123!',
    fullName: 'Test User',
    role: Role.USER,
    country: 'GH',
    isVerified: false,
  },
];

export class UserSeeder extends BaseSeeder {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  getName(): string {
    return 'UserSeeder';
  }

  async exists(): Promise<boolean> {
    const userRepository = this.dataSource.getRepository(User);
    const count = await userRepository.count();
    return count > 0;
  }

  async run(): Promise<void> {
    const userRepository = this.dataSource.getRepository(User);

    for (const userData of usersData) {
      // Check if user already exists by email (idempotent)
      const existingUser = await userRepository.findOne({
        where: { email: userData.email },
      });

      if (existingUser) {
        console.log(`⏭️  User already exists: ${userData.email}`);
        continue;
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);

      // Create user
      const user = userRepository.create({
        email: userData.email,
        passwordHash: hashedPassword,
        fullName: userData.fullName,
        role: userData.role,
        country: userData.country,
        phoneNumber: userData.phoneNumber,
        isVerified: userData.isVerified ?? false,
        isActive: true,
        preferredLanguage: 'en',
      });

      await userRepository.save(user);
      console.log(`✅ Created user: ${userData.email} (${userData.role})`);
    }

    const count = await userRepository.count();
    console.log(`\n📊 Total users in database: ${count}`);
  }
}
