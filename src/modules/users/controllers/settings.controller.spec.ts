import { Test, TestingModule } from '@nestjs/testing';

import { BadRequestException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { UsersService } from '../users.service';

describe('SettingsController', () => {
    let controller: SettingsController;
    let usersService: jest.Mocked<UsersService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SettingsController],
            providers: [
                {
                    provide: UsersService,
                    useValue: {
                        getSettings: jest.fn(),
                        updateSettings: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get(SettingsController);
        usersService = module.get(UsersService);
    });

    it('gets settings using req.user.sub when present', async () => {
        usersService.getSettings.mockResolvedValue({
            fullName: 'Amina Diallo',
            firstName: 'Amina',
            lastName: 'Diallo',
            preferredLanguage: 'en',
            country: 'ZZ',
            phoneNumber: null,
        });

        await controller.getSettings({ user: { sub: 'user-1' } } as any);

        expect(usersService.getSettings).toHaveBeenCalledWith('user-1');
    });

    it('updates settings using req.user.userId when present', async () => {
        usersService.updateSettings.mockResolvedValue({
            fullName: 'Amina Diallo',
            firstName: 'Amina',
            lastName: 'Diallo',
            preferredLanguage: 'sw',
            country: 'KE',
            phoneNumber: '+254712345678',
        });

        await controller.updateSettings(
            { user: { userId: 'user-2' } } as any,
            { preferredLanguage: 'sw' },
        );

        expect(usersService.updateSettings).toHaveBeenCalledWith('user-2', {
            preferredLanguage: 'sw',
        });
    });

    it('rejects requests without an authenticated user id', async () => {
        await expect(controller.getSettings({ user: {} } as any)).rejects.toThrow(
            BadRequestException,
        );
    });
});