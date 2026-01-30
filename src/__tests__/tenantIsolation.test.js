import mongoose from 'mongoose';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import { setTenantId } from '../utils/tenantContext.js';

describe('Multi-Tenant Data Isolation', () => {
    let tenantA, tenantB;

    beforeAll(async () => {
        // Assuming DB connection is already handled by test setup
        tenantA = await Tenant.create({ name: 'Org A', slug: 'org-a' });
        tenantB = await Tenant.create({ name: 'Org B', slug: 'org-b' });
    }, 60000);

    test('Should isolate data between tenants', async () => {
        // Create user for Tenant A
        await setTenantId(tenantA._id, async () => {
            // console.log('Current Store in test:', getTenantId());
            await User.create({ username: 'userA', email: 'a@a.com', role: 'patient' });
        });

        // Create user for Tenant B
        await setTenantId(tenantB._id, async () => {
            await User.create({ username: 'userB', email: 'b@b.com', role: 'patient' });
        });

        // Verify Tenant A only sees their user
        await setTenantId(tenantA._id, async () => {
            const users = await User.find({});
            expect(users).toHaveLength(1);
            expect(users[0].username).toBe('userA');
        });

        // Verify Tenant B only sees their user
        await setTenantId(tenantB._id, async () => {
            const users = await User.find({});
            expect(users).toHaveLength(1);
            expect(users[0].username).toBe('userB');
        });
    });

    test('Should automatically populate tenantId on save', async () => {
        let savedUser;
        await setTenantId(tenantA._id, async () => {
            savedUser = await User.create({ username: 'tenantUser', email: 't@t.com', role: 'patient' });
        });
        expect(savedUser.tenantId.toString()).toBe(tenantA._id.toString());
    });

    afterAll(async () => {
        await User.deleteMany({});
        await Tenant.deleteMany({});
    }, 60000);
});
