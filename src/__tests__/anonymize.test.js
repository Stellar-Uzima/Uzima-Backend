import anonymizationService from '../services/anonymize.service.js';

describe('Anonymization Service', () => {
  test('should anonymize specified fields', async () => {
    const record = { name: 'Alice', age: 30, email: 'alice@example.com' };
    const result = await anonymizationService.anonymizeRecord(record, {
      fieldsToAnonymize: ['email'],
    });

    expect(result.anonymized.email).not.toBe('alice@example.com');
    expect(result.anonymized.name).toBe('Alice');
  });

  test('should create reversible mapping if enabled', async () => {
    const record = { name: 'Bob', phone: '123456789' };
    const result = await anonymizationService.anonymizeRecord(record, {
      fieldsToAnonymize: ['phone'],
      reversible: true,
    });

    expect(result.mapping).toBeDefined();
    const hashedPhone = result.anonymized.phone;
    expect(result.mapping[hashedPhone]).toBe('123456789');
  });

  test('should redact specified fields', async () => {
    const record = { name: 'Charlie', secret: 'supersecret' };
    const result = await anonymizationService.anonymizeRecord(record, {
      fieldsToRedact: ['secret'],
    });

    expect(result.anonymized.secret).toBe('*******cret');
    expect(result.anonymized.name).toBe('Charlie');
  });
});
