import { DataSource } from 'typeorm';
import { DigestService } from './digest.service';

type Handler = (params: any[]) => any;

function fakeDataSource(handlers: Record<string, Handler>) {
  const calls: Array<{ marker: string; params: any[] }> = [];
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    const marker = /\/\* (digest:[\w-]+) \*\//.exec(sql)?.[1] ?? 'unknown';
    calls.push({ marker, params });
    return handlers[marker] ? handlers[marker](params) : [];
  });
  return { ds: { query } as unknown as DataSource, calls };
}

const NOW = new Date('2026-10-24T07:00:00Z');
const item = { id: 'n1', category: 'health', title: 'Hello', body: 'Body', created_at: new Date() };

describe('DigestService', () => {
  it('sends one digest for users with matching preferences and marks it sent', async () => {
    const sender = { send: jest.fn().mockResolvedValue(undefined) };
    const { ds, calls } = fakeDataSource({
      'digest:users': () => [{ user_id: 'u1', categories: ['health'] }],
      'digest:claim-insert': () => [{ id: 'd1' }],
      'digest:items': () => [item],
    });
    const summary = await new DigestService(ds, sender).run('daily', NOW);

    expect(summary).toEqual({ sent: 1, failed: 0, skipped: 0, ignored: 0 });
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.marker === 'digest:users')!.params).toEqual(['daily']);
    expect(calls.find((c) => c.marker === 'digest:claim-items')!.params[1]).toEqual(['health']);
    expect(calls.some((c) => c.marker === 'digest:mark-sent')).toBe(true);
  });

  it('is idempotent: an already-sent digest for the window is not sent again', async () => {
    const sender = { send: jest.fn() };
    const { ds } = fakeDataSource({
      'digest:users': () => [{ user_id: 'u1', categories: ['health'] }],
      'digest:claim-insert': () => [], // row already exists
      'digest:reclaim': () => [], // sent/skipped/in progress: nothing to reclaim
    });
    const summary = await new DigestService(ds, sender).run('daily', NOW);

    expect(summary.ignored).toBe(1);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('records a failure with the error and keeps processing other users', async () => {
    const sender = {
      send: jest.fn().mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce(undefined),
    };
    const { ds, calls } = fakeDataSource({
      'digest:users': () => [
        { user_id: 'u1', categories: ['health'] },
        { user_id: 'u2', categories: ['health'] },
      ],
      'digest:claim-insert': () => [{ id: 'dx' }],
      'digest:items': () => [item],
    });
    const summary = await new DigestService(ds, sender).run('daily', NOW);

    expect(summary).toEqual({ sent: 1, failed: 1, skipped: 0, ignored: 0 });
    const failed = calls.find((c) => c.marker === 'digest:mark-failed')!;
    expect(failed.params[1]).toContain('smtp down');
  });

  it('retries a previously failed digest via reclaim', async () => {
    const sender = { send: jest.fn().mockResolvedValue(undefined) };
    const { ds } = fakeDataSource({
      'digest:users': () => [{ user_id: 'u1', categories: ['health'] }],
      'digest:claim-insert': () => [],
      'digest:reclaim': () => [{ id: 'd1' }],
      'digest:items': () => [item],
    });
    const summary = await new DigestService(ds, sender).run('daily', NOW);

    expect(summary.sent).toBe(1);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('skips (and does not send) when no notifications match', async () => {
    const sender = { send: jest.fn() };
    const { ds, calls } = fakeDataSource({
      'digest:users': () => [{ user_id: 'u1', categories: ['health'] }],
      'digest:claim-insert': () => [{ id: 'd1' }],
      'digest:items': () => [],
    });
    const summary = await new DigestService(ds, sender).run('daily', NOW);

    expect(summary.skipped).toBe(1);
    expect(sender.send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.marker === 'digest:mark-skipped')).toBe(true);
  });
});
