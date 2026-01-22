/* eslint-disable prettier/prettier */
import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import PaymentWebhook from '../models/PaymentWebhook.js';
import { startReconciliationRun } from '../services/reconciliation.service.js';

describe('reconciliation service', () => {
  it('matches webhooks to payments and detects discrepancies', async () => {
    // Matching payment + webhook
    const paymentMatched = await Payment.create({
      provider: 'test-gateway',
      transactionId: 'tx-matched',
      amount: 100,
      currency: 'USD',
      status: 'succeeded',
    });

    await PaymentWebhook.create({
      provider: 'test-gateway',
      transactionId: 'tx-matched',
      amount: 100,
      currency: 'USD',
      eventType: 'payment_succeeded',
    });

    // Orphaned webhook (no payment)
    await PaymentWebhook.create({
      provider: 'test-gateway',
      transactionId: 'tx-orphan',
      amount: 50,
      currency: 'USD',
      eventType: 'payment_succeeded',
    });

    // Payment with no webhook
    await Payment.create({
      provider: 'test-gateway',
      transactionId: 'tx-missing-webhook',
      amount: 75,
      currency: 'USD',
      status: 'succeeded',
    });

    // Amount mismatch
    await Payment.create({
      provider: 'test-gateway',
      transactionId: 'tx-mismatch',
      amount: 200,
      currency: 'USD',
      status: 'succeeded',
    });

    await PaymentWebhook.create({
      provider: 'test-gateway',
      transactionId: 'tx-mismatch',
      amount: 300,
      currency: 'USD',
      eventType: 'payment_succeeded',
    });

    const report = await startReconciliationRun({ provider: 'test-gateway' });

    expect(report.summary.totalPayments).toBe(3);
    expect(report.summary.totalWebhooks).toBe(3);
    expect(report.summary.matchedCount).toBe(1);
    expect(report.summary.orphanedWebhookCount).toBe(1);
    expect(report.summary.missingWebhookCount).toBe(1);
    expect(report.summary.amountMismatchCount).toBe(1);

    // Ensure IDs are wired correctly
    expect(report.matched[0].paymentId.toString()).toBe(paymentMatched._id.toString());
  });

  it('handles empty datasets', async () => {
    const report = await startReconciliationRun({ provider: 'no-data' });
    expect(report.summary.totalPayments).toBe(0);
    expect(report.summary.totalWebhooks).toBe(0);
    expect(report.summary.matchedCount).toBe(0);
    expect(report.summary.orphanedWebhookCount).toBe(0);
    expect(report.summary.missingWebhookCount).toBe(0);
    expect(report.summary.amountMismatchCount).toBe(0);
  });
});