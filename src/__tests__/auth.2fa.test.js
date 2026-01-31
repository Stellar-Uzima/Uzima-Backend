import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';

// Mock crypto module
vi.mock('crypto', () => {
    const mockHash = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('hashed_code'),
    };
    return {
        default: {
            createHash: vi.fn().mockReturnValue(mockHash),
            randomBytes: vi.fn().mockReturnValue(Buffer.from('random')),
        },
        createHash: vi.fn().mockReturnValue(mockHash),
        randomBytes: vi.fn().mockReturnValue(Buffer.from('random')),
    };
});

// Hoist mocks
const { mockUserInstance, UserMock } = vi.hoisted(() => {
    const mockUserInstance = {
        _id: 'user_id_123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed_password',
        role: 'patient',
        security: {},
        save: vi.fn().mockResolvedValue(true),
    };

    const UserMock = {
        findOne: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
    };

    return { mockUserInstance, UserMock };
});

// Mock MongoMemoryServer to bypass setup.js issues
vi.mock('mongodb-memory-server', () => ({
    MongoMemoryReplSet: {
        create: vi.fn().mockResolvedValue({
            getUri: () => 'mongodb://mock-uri',
            stop: vi.fn(),
        }),
    },
}));

// Mock Mongoose
vi.mock('mongoose', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        connect: vi.fn().mockResolvedValue(),
        disconnect: vi.fn().mockResolvedValue(),
        connection: { collections: {} },
        Schema: class { },
        model: vi.fn(),
    };
});

// Mock dependencies
vi.mock('bcrypt', () => ({
    default: {
        hash: vi.fn().mockResolvedValue('hashed_password'),
        compare: vi.fn().mockResolvedValue(true),
    },
}));

vi.mock('../utils/generateToken.js', () => ({
    default: vi.fn().mockReturnValue('mock_access_token'),
    generateAccessToken: vi.fn().mockReturnValue('mock_access_token'),
    generateRefreshTokenPayload: vi.fn().mockReturnValue({ payload: {}, expiresAt: new Date() }),
}));

// Mock Models
vi.mock('../models/User.js', () => {
    // Constructor mock
    const UserModel = vi.fn(() => mockUserInstance);
    Object.assign(UserModel, UserMock);
    return { default: UserModel };
});

vi.mock('../models/RefreshToken.js', () => ({
    default: {
        create: vi.fn(),
        findOne: vi.fn(),
    },
}));

// Mock Services
vi.mock('../services/smsService.js', () => ({
    sendSMS: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../services/email.Service.js', () => ({
    default: { sendMail: vi.fn().mockResolvedValue(true) },
}));

// Mock Middleware
vi.mock('../middleware/rateLimiter.js', () => ({
    authRateLimit: (req, res, next) => next(),
    twoFactorRateLimit: (req, res, next) => next(),
    passwordResetRateLimit: (req, res, next) => next(),
}));

vi.mock('../middleware/activityLogger.js', () => ({
    activityLogger: () => (req, res, next) => next(),
}));

// Mock Auth Middleware (protect)
vi.mock('../middleware/authMiddleware.js', () => ({
    default: (req, res, next) => {
        req.user = { id: 'user_id_123', role: 'patient' };
        next();
    },
}));

// Mock Validate Middleware
vi.mock('../middleware/validationMiddleware.js', () => ({
    validate: (schema) => (req, res, next) => next(),
}));

// Import routes
import authRoutes from '../routes/authRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

// Error handler middleware
app.use((err, req, res, next) => {
    fs.writeFileSync('error.log', `Error: ${err.message}\nStack: ${err.stack}\n\n`, { flag: 'a' });
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message,
        data: null,
    });
});

describe('Auth 2FA Unit Tests', () => {
    afterEach(() => {
        vi.clearAllMocks();
        mockUserInstance.phoneNumber = undefined;
        mockUserInstance.security = {};
        mockUserInstance.isPhoneVerified = undefined;
        mockUserInstance.twoFactorMethod = undefined;
    });

    it('should enable SMS 2FA', async () => {
        // Setup mock
        UserMock.findById.mockResolvedValue(mockUserInstance);
        UserMock.findOne.mockResolvedValue(null); // No existing phone

        const res = await request(app)
            .post('/api/auth/2fa/sms/enable')
            .send({ phoneNumber: '+1234567890' });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Verification code sent');
        expect(mockUserInstance.phoneNumber).toBe('+1234567890');
        expect(mockUserInstance.security.twoFactorCode).toBeDefined();
        expect(mockUserInstance.save).toHaveBeenCalled();
    });

    it('should verify SMS 2FA code', async () => {
        // Setup mock user with pending 2FA
        mockUserInstance.security = {
            twoFactorCode: 'hashed_code',
            twoFactorCodeExpires: new Date(Date.now() + 10000)
        };

        // Crypto is already mocked globally

        UserMock.findById.mockResolvedValue(mockUserInstance);

        const res = await request(app)
            .post('/api/auth/2fa/sms/verify')
            .send({ code: '123456' });

        if (res.statusCode !== 200) console.log('Verify Error:', res.body);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('SMS 2FA enabled successfully');
        expect(mockUserInstance.isPhoneVerified).toBe(true);
        expect(mockUserInstance.twoFactorMethod).toBe('sms');
    });

    it('should require 2FA on login when enabled', async () => {
        const userWith2FA = { ...mockUserInstance, twoFactorMethod: 'sms', isPhoneVerified: true, phoneNumber: '+1234567890' };
        UserMock.findOne.mockResolvedValue(userWith2FA);

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'password' });

        if (res.statusCode !== 200) console.log('Login Error:', res.body);

        expect(res.statusCode).toBe(200);
        expect(res.body.data.require2FA).toBe(true);
        expect(res.body.data.method).toBe('sms');

        userWith2FA.save = vi.fn();
        userWith2FA.security = {};
    });

    it('should login with 2FA code', async () => {
        const userWithCode = {
            ...mockUserInstance,
            twoFactorMethod: 'sms',
            isPhoneVerified: true,
            security: {
                twoFactorCode: 'hashed_code',
                twoFactorCodeExpires: new Date(Date.now() + 10000)
            },
            save: vi.fn(),
            _id: 'user_id_123'
        };
        UserMock.findOne.mockResolvedValue(userWithCode);

        // Crypto is already mocked globally

        const res = await request(app)
            .post('/api/auth/login-2fa')
            .send({ email: 'test@example.com', password: 'password', twoFactorCode: '123456', method: 'sms' });

        if (res.statusCode !== 200) console.log('Login-2FA Error:', res.body);

        expect(res.statusCode).toBe(200);
        expect(res.body.data.accessToken).toBe('mock_access_token');
    });
});
