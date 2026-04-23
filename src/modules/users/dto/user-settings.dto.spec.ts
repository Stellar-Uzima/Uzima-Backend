import { UpdateUserSettingsDto } from './user-settings.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UpdateUserSettingsDto', () => {
    it('accepts valid settings payloads', async () => {
        const dto = plainToInstance(UpdateUserSettingsDto, {
            fullName: 'Amina Diallo',
            preferredLanguage: 'SW',
            country: 'ke',
            phoneNumber: '+254712345678',
        });

        const errors = await validate(dto);

        expect(errors).toHaveLength(0);
        expect(dto.preferredLanguage).toBe('sw');
        expect(dto.country).toBe('KE');
    });

    it('rejects unsupported languages', async () => {
        const dto = plainToInstance(UpdateUserSettingsDto, {
            preferredLanguage: 'pt',
        });

        const errors = await validate(dto);

        expect(errors).not.toHaveLength(0);
        expect(errors[0]?.property).toBe('preferredLanguage');
    });

    it('rejects invalid country codes', async () => {
        const dto = plainToInstance(UpdateUserSettingsDto, {
            country: 'KEN',
        });

        const errors = await validate(dto);

        expect(errors).not.toHaveLength(0);
        expect(errors[0]?.property).toBe('country');
    });

    it('allows clearing phone number with null', async () => {
        const dto = plainToInstance(UpdateUserSettingsDto, {
            phoneNumber: null,
        });

        const errors = await validate(dto);

        expect(errors).toHaveLength(0);
        expect(dto.phoneNumber).toBeNull();
    });
});