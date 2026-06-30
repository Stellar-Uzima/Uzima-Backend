import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();
    service = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('hashPassword returns a bcrypt hash distinct from plaintext', async () => {
    const hash = await service.hashPassword('mySecret123');
    expect(hash).not.toBe('mySecret123');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('comparePassword returns true when password matches hash', async () => {
    const hash = await service.hashPassword('correct-password');
    expect(await service.comparePassword('correct-password', hash)).toBe(true);
  });

  it('comparePassword returns false for wrong password', async () => {
    const hash = await service.hashPassword('correct');
    expect(await service.comparePassword('wrong', hash)).toBe(false);
  });
});
