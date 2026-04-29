/**
 * Test Fixtures and Data Factories
 * 
 * Provides factories for generating realistic test data with:
 * - User factory for various roles
 * - Organization factory with relationships
 * - Session factory for authentication tests
 * - Task factory for task-related tests
 * - Custom data generation with overrides
 */

import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../../src/database/entities/user.entity';
import { Organization } from '../../src/database/entities/organization.entity';
import { Session } from '../../src/database/entities/session.entity';
import { HealthTask } from '../../src/entities/health-task.entity';

/**
 * User Factory
 * Generates realistic user data with customizable fields
 */
export class UserFactory {
  /**
   * Create a single user
   */
  static async create(overrides: Partial<User> = {}): Promise<User> {
    const password = overrides.password || faker.internet.password({ length: 12 });
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User();
    user.id = overrides.id || uuidv4();
    user.email = overrides.email || faker.internet.email();
    user.firstName = overrides.firstName || faker.name.firstName();
    user.lastName = overrides.lastName || faker.name.lastName();
    user.password = hashedPassword;
    user.phone = overrides.phone || faker.phone.number('+1##########');
    user.avatar = overrides.avatar || faker.image.avatar();
    user.role = overrides.role || UserRole.USER;
    user.isActive = overrides.isActive !== undefined ? overrides.isActive : true;
    user.emailVerified = overrides.emailVerified !== undefined ? overrides.emailVerified : false;
    user.createdAt = overrides.createdAt || new Date();
    user.updatedAt = overrides.updatedAt || new Date();

    return user;
  }

  /**
   * Create multiple users
   */
  static async createMany(
    count: number,
    overrides: Partial<User> = {},
  ): Promise<User[]> {
    const users: User[] = [];
    for (let i = 0; i < count; i++) {
      const user = await UserFactory.create({
        ...overrides,
        email: overrides.email ? `${overrides.email}-${i}` : faker.internet.email(),
      });
      users.push(user);
    }
    return users;
  }

  /**
   * Create an admin user
   */
  static async createAdmin(overrides: Partial<User> = {}): Promise<User> {
    return UserFactory.create({
      ...overrides,
      role: UserRole.ADMIN,
      emailVerified: true,
    });
  }

  /**
   * Create a healer user
   */
  static async createHealer(overrides: Partial<User> = {}): Promise<User> {
    return UserFactory.create({
      ...overrides,
      role: UserRole.HEALER,
      emailVerified: true,
    });
  }

  /**
   * Create a verified user
   */
  static async createVerified(overrides: Partial<User> = {}): Promise<User> {
    return UserFactory.create({
      ...overrides,
      emailVerified: true,
      isActive: true,
    });
  }

  /**
   * Create an inactive user
   */
  static async createInactive(overrides: Partial<User> = {}): Promise<User> {
    return UserFactory.create({
      ...overrides,
      isActive: false,
    });
  }

  /**
   * Create a user with specific credentials
   */
  static async createWithCredentials(
    email: string,
    plainPassword: string,
    overrides: Partial<User> = {},
  ): Promise<User> {
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    return UserFactory.create({
      ...overrides,
      email,
      password: hashedPassword,
    });
  }

  /**
   * Generate bulk users with realistic variation
   */
  static async createBatch(
    count: number,
    options: {
      roles?: UserRole[];
      emailDomain?: string;
      verifiedCount?: number;
    } = {},
  ): Promise<User[]> {
    const roles = options.roles || [UserRole.USER, UserRole.HEALER, UserRole.ADMIN];
    const emailDomain = options.emailDomain || 'example.com';
    const verifiedCount = options.verifiedCount || Math.floor(count * 0.7);

    const users: User[] = [];
    for (let i = 0; i < count; i++) {
      const role = roles[i % roles.length];
      const isVerified = i < verifiedCount;
      const user = await UserFactory.create({
        email: `test-user-${i}@${emailDomain}`,
        role,
        emailVerified: isVerified,
        firstName: faker.name.firstName(),
        lastName: faker.name.lastName(),
      });
      users.push(user);
    }
    return users;
  }
}

/**
 * Organization Factory
 * Generates realistic organization data
 */
export class OrganizationFactory {
  /**
   * Create a single organization
   */
  static create(overrides: Partial<Organization> = {}): Organization {
    const org = new Organization();
    org.id = overrides.id || uuidv4();
    org.name = overrides.name || faker.company.name();
    org.description = overrides.description || faker.lorem.paragraph();
    org.website = overrides.website || faker.internet.url();
    org.createdAt = overrides.createdAt || new Date();
    org.updatedAt = overrides.updatedAt || new Date();
    org.users = overrides.users || [];

    return org;
  }

  /**
   * Create multiple organizations
   */
  static createMany(
    count: number,
    overrides: Partial<Organization> = {},
  ): Organization[] {
    const orgs: Organization[] = [];
    for (let i = 0; i < count; i++) {
      const org = OrganizationFactory.create({
        ...overrides,
        name: overrides.name ? `${overrides.name}-${i}` : faker.company.name(),
      });
      orgs.push(org);
    }
    return orgs;
  }

  /**
   * Create organization with users
   */
  static async createWithUsers(
    userCount: number,
    overrides: Partial<Organization> = {},
  ): Promise<Organization> {
    const org = OrganizationFactory.create(overrides);
    org.users = await UserFactory.createMany(userCount);
    return org;
  }

  /**
   * Create realistic organizations with batch
   */
  static createBatch(
    count: number,
    options: {
      nameSuffix?: string;
      withDescription?: boolean;
    } = {},
  ): Organization[] {
    const orgs: Organization[] = [];
    for (let i = 0; i < count; i++) {
      const org = OrganizationFactory.create({
        name: `Test Org ${i}${options.nameSuffix ? `-${options.nameSuffix}` : ''}`,
        description: options.withDescription ? faker.lorem.paragraph() : undefined,
      });
      orgs.push(org);
    }
    return orgs;
  }
}

/**
 * Session Factory
 * Generates realistic session data for authentication tests
 */
export class SessionFactory {
  /**
   * Create a single session
   */
  static create(
    user: User,
    overrides: Partial<Session> = {},
  ): Session {
    const session = new Session();
    session.id = overrides.id || uuidv4();
    session.tokenId = overrides.tokenId || this.generateTokenId();
    session.user = overrides.user || user;
    session.device = overrides.device || faker.datatype.string(20);
    session.ip = overrides.ip || faker.internet.ipv4();
    session.userAgent = overrides.userAgent || faker.internet.userAgent();
    session.isActive = overrides.isActive !== undefined ? overrides.isActive : true;
    session.createdAt = overrides.createdAt || new Date();
    session.lastActiveAt = overrides.lastActiveAt || new Date();

    return session;
  }

  /**
   * Create multiple sessions for a user
   */
  static createMany(
    user: User,
    count: number,
    overrides: Partial<Session> = {},
  ): Session[] {
    const sessions: Session[] = [];
    for (let i = 0; i < count; i++) {
      const session = SessionFactory.create(user, {
        ...overrides,
        device: `Device ${i}`,
      });
      sessions.push(session);
    }
    return sessions;
  }

  /**
   * Create active session
   */
  static createActive(
    user: User,
    overrides: Partial<Session> = {},
  ): Session {
    return SessionFactory.create(user, {
      ...overrides,
      isActive: true,
    });
  }

  /**
   * Create expired/inactive session
   */
  static createInactive(
    user: User,
    overrides: Partial<Session> = {},
  ): Session {
    return SessionFactory.create(user, {
      ...overrides,
      isActive: false,
    });
  }

  /**
   * Create session with mobile device
   */
  static createMobileSession(
    user: User,
    overrides: Partial<Session> = {},
  ): Session {
    return SessionFactory.create(user, {
      ...overrides,
      device: 'Mobile',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
    });
  }

  /**
   * Create session with desktop device
   */
  static createDesktopSession(
    user: User,
    overrides: Partial<Session> = {},
  ): Session {
    return SessionFactory.create(user, {
      ...overrides,
      device: 'Desktop',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
  }

  /**
   * Generate random token ID
   */
  private static generateTokenId(): string {
    return faker.datatype.hexaDecimal(32);
  }
}

/**
 * Task Factory
 * Generates realistic task/health task data
 */
export class TaskFactory {
  /**
   * Create a single task
   */
  static create(
    user: User,
    overrides: Partial<HealthTask> = {},
  ): HealthTask {
    const task = new HealthTask();
    task.id = overrides.id || uuidv4();
    task.user = overrides.user || user;
    task.userId = overrides.userId || user.id;
    task.title = overrides.title || `Health Task: ${faker.lorem.words(3)}`;
    task.description =
      overrides.description || faker.lorem.paragraph();
    task.rewardAmount =
      overrides.rewardAmount !== undefined
        ? overrides.rewardAmount
        : Number(faker.datatype.float({ min: 10, max: 1000, precision: 0.01 }));
    task.categoryId = overrides.categoryId || uuidv4();
    task.isActive = overrides.isActive !== undefined ? overrides.isActive : true;
    task.createdAt = overrides.createdAt || new Date();
    task.updatedAt = overrides.updatedAt || new Date();

    return task;
  }

  /**
   * Create multiple tasks for a user
   */
  static createMany(
    user: User,
    count: number,
    overrides: Partial<HealthTask> = {},
  ): HealthTask[] {
    const tasks: HealthTask[] = [];
    for (let i = 0; i < count; i++) {
      const task = TaskFactory.create(user, {
        ...overrides,
        title: `Task ${i}: ${faker.lorem.words(2)}`,
      });
      tasks.push(task);
    }
    return tasks;
  }

  /**
   * Create active task
   */
  static createActive(
    user: User,
    overrides: Partial<HealthTask> = {},
  ): HealthTask {
    return TaskFactory.create(user, {
      ...overrides,
      isActive: true,
    });
  }

  /**
   * Create inactive task
   */
  static createInactive(
    user: User,
    overrides: Partial<HealthTask> = {},
  ): HealthTask {
    return TaskFactory.create(user, {
      ...overrides,
      isActive: false,
    });
  }

  /**
   * Create high-reward task
   */
  static createHighReward(
    user: User,
    overrides: Partial<HealthTask> = {},
  ): HealthTask {
    return TaskFactory.create(user, {
      ...overrides,
      rewardAmount: Number(faker.datatype.float({ min: 500, max: 1000 })),
    });
  }

  /**
   * Create low-reward task
   */
  static createLowReward(
    user: User,
    overrides: Partial<HealthTask> = {},
  ): HealthTask {
    return TaskFactory.create(user, {
      ...overrides,
      rewardAmount: Number(faker.datatype.float({ min: 10, max: 50 })),
    });
  }
}

/**
 * Factory Collection
 * Provides convenience methods for creating complete test environments
 */
export class TestDataFactory {
  /**
   * Create a complete test environment with users, organizations, and sessions
   */
  static async createTestEnvironment(options: {
    userCount?: number;
    orgCount?: number;
    sessionsPerUser?: number;
    tasksPerUser?: number;
  } = {}) {
    const userCount = options.userCount || 5;
    const orgCount = options.orgCount || 2;
    const sessionsPerUser = options.sessionsPerUser || 2;
    const tasksPerUser = options.tasksPerUser || 3;

    const users = await UserFactory.createBatch(userCount);
    const organizations = OrganizationFactory.createBatch(orgCount);
    
    // Assign users to organizations
    const usersWithOrgs = users.map((user, index) => {
      user.organizations = [organizations[index % orgCount]];
      return user;
    });

    const sessions = usersWithOrgs.flatMap((user) =>
      SessionFactory.createMany(user, sessionsPerUser),
    );

    const tasks = usersWithOrgs.flatMap((user) =>
      TaskFactory.createMany(user, tasksPerUser),
    );

    return {
      users: usersWithOrgs,
      organizations,
      sessions,
      tasks,
    };
  }

  /**
   * Create admin user with sessions
   */
  static async createAdminWithSessions(sessionCount: number = 3) {
    const admin = await UserFactory.createAdmin();
    const sessions = SessionFactory.createMany(admin, sessionCount);
    return { admin, sessions };
  }

  /**
   * Create test user profile (user with all related data)
   */
  static async createUserProfile(options: {
    role?: UserRole;
    sessionsCount?: number;
    tasksCount?: number;
  } = {}) {
    const user = await UserFactory.create({
      role: options.role || UserRole.USER,
      emailVerified: true,
    });

    const sessions = SessionFactory.createMany(user, options.sessionsCount || 1);
    const tasks = TaskFactory.createMany(user, options.tasksCount || 3);

    return {
      user,
      sessions,
      tasks,
    };
  }
}

/**
 * Test Fixture Presets
 * Common test data scenarios
 */
export const testFixtures = {
  /**
   * Default test user credentials
   */
  credentials: {
    email: 'test@example.com',
    password: 'Test@123456',
    firstName: 'Test',
    lastName: 'User',
  },

  /**
   * Multiple users with different roles
   */
  async getMultiRoleUsers() {
    const admin = await UserFactory.createAdmin();
    const healer = await UserFactory.createHealer();
    const regularUser = await UserFactory.create();

    return { admin, healer, regularUser };
  },

  /**
   * Test organization with members
   */
  async getOrganizationWithMembers(memberCount: number = 5) {
    return OrganizationFactory.createWithUsers(memberCount);
  },

  /**
   * Verified user with active sessions
   */
  async getVerifiedUserWithSessions(sessionCount: number = 2) {
    const user = await UserFactory.createVerified();
    const sessions = SessionFactory.createMany(user, sessionCount);
    return { user, sessions };
  },
};
