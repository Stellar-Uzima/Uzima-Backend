import { Test, TestingModule } from '@nestjs/testing';

import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('ModulesUsersService', () => {
    let service: UsersService;
    let userRepository: jest.Mocked<Repository<User>>;

    const mockRepository = {
        findOne: jest.fn(),
        save: jest.fn(),
    };

    const user = {
        id: 'user-1',
        email: 'amina@example.com',
        phoneNumber: null,
        country: null,
        preferredLanguage: null,
        firstName: null,
        lastName: null,
        fullName: null,
    } as unknown as User;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                {
                    provide: getRepositoryToken(User),
                    useValue: mockRepository,
                },
            ],
        }).compile();

        service = module.get(UsersService);
        userRepository = module.get(getRepositoryToken(User));
        jest.clearAllMocks();
    });

    it('returns defaults when optional settings are unset', async () => {
        userRepository.findOne.mockResolvedValue(user);

        const result = await service.getSettings('user-1');

        expect(result).toEqual({
            fullName: 'amina',
            firstName: 'amina',
            lastName: '',
            preferredLanguage: 'en',
            country: 'ZZ',
            phoneNumber: null,
        });
    });

    it('updates settings and recomputes name parts', async () => {
        userRepository.findOne.mockResolvedValue({ ...user });
        userRepository.save.mockImplementation(async (entity) => entity as User);

        const result = await service.updateSettings('user-1', {
            fullName: 'Amina Diallo',
            preferredLanguage: 'sw',
            country: 'KE',
            phoneNumber: '+254712345678',
        });

        expect(userRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                fullName: 'Amina Diallo',
                firstName: 'Amina',
                lastName: 'Diallo',
                preferredLanguage: 'sw',
                country: 'KE',
                phoneNumber: '+254712345678',
            }),
        );
        expect(result.fullName).toBe('Amina Diallo');
        expect(result.firstName).toBe('Amina');
        expect(result.lastName).toBe('Diallo');
    });

    it('allows clearing a phone number', async () => {
        userRepository.findOne.mockResolvedValue({
            ...user,
            phoneNumber: '+254712345678',
        } as User);
        userRepository.save.mockImplementation(async (entity) => entity as User);

        const result = await service.updateSettings('user-1', {
            phoneNumber: null,
        });

        expect(userRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ phoneNumber: null }),
        );
        expect(result.phoneNumber).toBeNull();
    });

    it('throws when the user does not exist', async () => {
        userRepository.findOne.mockResolvedValue(null);

        await expect(service.getSettings('missing')).rejects.toThrow(
            NotFoundException,
        );
    });
});