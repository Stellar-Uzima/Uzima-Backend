/// <reference types="jest" />
import { DataSource } from 'typeorm';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let dataSource: DataSource;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    dataSource = { query: queryMock } as any;
    service = new SearchService(dataSource);
  });

  it('searchUsers("jon") returns matches including john using fuzzy search', async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: '1',
          first_name: 'John',
          last_name: 'Doe',
          full_name: 'John Doe',
          email: 'john@example.com',
          rank: 0.92,
        },
      ])
      .mockResolvedValueOnce([{ total: '1' }]);

    const result = await service.searchUsers('jon', { limit: 5, offset: 0, fuzzy: true });

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(1);
    expect(result.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ first_name: 'John', email: 'john@example.com' })]),
    );

    const [selectSql, selectParams] = queryMock.mock.calls[0];
    expect(selectSql).toContain('similarity(');
    expect(selectParams).toEqual(expect.arrayContaining(['jon', '%jon%', 'jon%']));
  });

  it('searchTasks returns task results for fuzzy title search', async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: 'task-1',
          title: 'Fitness Challenge',
          description: 'Daily workout',
          rank: 0.88,
        },
      ])
      .mockResolvedValueOnce([{ total: '1' }]);

    const result = await service.searchTasks('fitn', { limit: 5, offset: 0, fuzzy: true });

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(result.data[0]).toMatchObject({ title: 'Fitness Challenge' });
    expect(result.total).toBe(1);

    const [selectSql, selectParams] = queryMock.mock.calls[0];
    expect(selectSql).toContain('similarity(');
    expect(selectParams).toEqual(expect.arrayContaining(['fitn', '%fitn%', 'fitn%']));
  });
});
