import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn() },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createMockContext(user?: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ role: Role.USER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when roles array is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const context = createMockContext({ role: Role.USER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow ADMIN access to admin-only endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createMockContext({ role: Role.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny HEALER access to admin-only endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createMockContext({ role: Role.HEALER });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should deny USER access to admin-only endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createMockContext({ role: Role.USER });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should deny access when no user is on the request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should deny access when user has no role property', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createMockContext({});

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow HEALER access to multi-role endpoint requiring ADMIN or HEALER', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMIN, Role.HEALER]);
    const context = createMockContext({ role: Role.HEALER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny USER access to multi-role endpoint requiring ADMIN or HEALER', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMIN, Role.HEALER]);
    const context = createMockContext({ role: Role.USER });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should call reflector with correct metadata key and context targets', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);
    const context = createMockContext({ role: Role.USER });

    guard.canActivate(context);

    expect(spy).toHaveBeenCalledWith(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
