import { Repository } from 'typeorm';

/**
 * Mock TypeORM repository with standard methods.
 */
export type MockRepository<T = any> = {
  find: jest.Mock<Promise<T[]>, []>;
  findOne: jest.Mock<Promise<T | null>, [Partial<T>]>;
  save: jest.Mock<Promise<T>, [Partial<T>]>;
  delete: jest.Mock<Promise<void>, [any]>;
};

/**
 * Factory to create a new mock repository.
 */
export const createMockRepository = <T = any>(): MockRepository<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});
