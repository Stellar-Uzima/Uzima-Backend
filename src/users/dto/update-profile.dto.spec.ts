import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto', () => {
  const validate$ = (data: object) => {
    const dto = plainToInstance(UpdateProfileDto, data);
    return validate(dto);
  };

  it('should pass with valid data', async () => {
    const errors = await validate$({
      fullName: 'Amara Diallo',
      country: 'NG',
      preferredLanguage: 'en',
    });
    expect(errors.length).toBe(0);
  });

  it('should fail if fullName is too short', async () => {
    const errors = await validate$({ fullName: 'A' });
    expect(errors[0].property).toBe('fullName');
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('should fail if fullName exceeds 60 characters', async () => {
    const errors = await validate$({ fullName: 'A'.repeat(61) });
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  it('should fail if country is not 2 characters', async () => {
    const errors = await validate$({ country: 'NGA' });
    expect(errors[0].property).toBe('country');
  });

  it('should fail if preferredLanguage is not supported', async () => {
    const errors = await validate$({ preferredLanguage: 'xyz' });
    expect(errors[0].property).toBe('preferredLanguage');
  });

  it('should pass with empty object (all fields optional)', async () => {
    const errors = await validate$({});
    expect(errors.length).toBe(0);
  });
});