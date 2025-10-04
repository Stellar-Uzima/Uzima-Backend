import anonymizationService from "../services/anonymize.service.js";

describe("Anonymization Service", () => {
  test("should anonymize specified fields", () => {
    const record = { name: "Alice", age: 30, email: "alice@example.com" };
    const result = anonymizationService.anonymizeRecord(record, {
      fieldsToAnonymize: ["email"],
    });

    expect(result.anonymized.email).not.toBe("alice@example.com");
    expect(result.anonymized.name).toBe("Alice");
  });

  test("should create reversible mapping if enabled", () => {
    const record = { name: "Bob", phone: "123456789" };
    const result = anonymizationService.anonymizeRecord(record, {
      fieldsToAnonymize: ["phone"],
      reversible: true,
    });

    expect(result.mapping).toBeDefined();
    const hashedPhone = result.anonymized.phone;
    expect(result.mapping[hashedPhone]).toBe("123456789");
  });
});
