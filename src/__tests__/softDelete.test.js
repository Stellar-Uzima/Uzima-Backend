import request from 'supertest';
import app from '../index.js';
import User from '../models/User.js';
import Record from '../models/Record.js';

let userId, recordId;

describe('Soft Delete, Restore, Purge Flows', () => {
  beforeAll(async () => {
    // Create a test user
    const user = new User({ username: 'testuser', email: 'test@example.com', role: 'admin' });
    await user.save();
    userId = user._id;
    // Create a test record
    const record = new Record({
      patientName: 'John Doe',
      diagnosis: 'Flu',
      treatment: 'Rest',
      createdBy: userId,
    });
    await record.save();
    recordId = record._id;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Record.deleteMany({});
  });

  it('should soft-delete a user', async () => {
    const res = await request(app)
      .delete(`/admin/users/${userId}`)
      .set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    const user = await User.findById(userId);
    expect(user.deletedAt).not.toBeNull();
  });

  it('should restore a soft-deleted user', async () => {
    await User.findByIdAndUpdate(userId, { deletedAt: new Date() });
    const res = await request(app)
      .post(`/admin/users/${userId}/restore`)
      .set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    const user = await User.findById(userId);
    expect(user.deletedAt).toBeNull();
  });

  it('should purge a soft-deleted user', async () => {
    await User.findByIdAndUpdate(userId, { deletedAt: new Date() });
    const res = await request(app)
      .delete(`/admin/users/${userId}/purge`)
      .set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    const user = await User.findById(userId);
    expect(user).toBeNull();
  });

  it('should soft-delete a record', async () => {
    const res = await request(app)
      .delete(`/admin/records/${recordId}`)
      .set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    const record = await Record.findById(recordId);
    expect(record.deletedAt).not.toBeNull();
  });

  it('should restore a soft-deleted record', async () => {
    await Record.findByIdAndUpdate(recordId, { deletedAt: new Date() });
    const res = await request(app)
      .post(`/admin/records/${recordId}/restore`)
      .set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    const record = await Record.findById(recordId);
    expect(record.deletedAt).toBeNull();
  });

  it('should purge a soft-deleted record', async () => {
    await Record.findByIdAndUpdate(recordId, { deletedAt: new Date() });
    const res = await request(app)
      .delete(`/admin/records/${recordId}/purge`)
      .set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    const record = await Record.findById(recordId);
    expect(record).toBeNull();
  });

  it('should query soft-deleted users with includeDeleted=true', async () => {
    await User.findByIdAndUpdate(userId, { deletedAt: new Date() });
    const res = await request(app)
      .get('/admin/users?includeDeleted=true')
      .set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.some(u => u.id === String(userId))).toBe(true);
  });

  it('should query soft-deleted records with includeDeleted=true', async () => {
    await Record.findByIdAndUpdate(recordId, { deletedAt: new Date() });
    const res = await request(app)
      .get('/admin/records?includeDeleted=true')
      .set('Accept', 'application/json');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.records.some(r => r._id === String(recordId))).toBe(true);
  });
});
