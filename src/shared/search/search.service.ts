import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

type QueryParamValue = string | number | boolean | Date | null;

interface SearchOptions {
  limit?: number;
  offset?: number;
  filters?: Record<string, QueryParamValue>;
  orderBy?: string;
  fuzzy?: boolean;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly dataSource: DataSource) {}

  async searchUsers<T = Record<string, unknown>>(
    query: string,
    options: SearchOptions = {},
  ): Promise<{ data: T[]; total: number }> {
    return this.searchTable<T>('users', ['email', 'first_name', 'last_name', 'full_name'], query, options);
  }

  async searchTasks<T = Record<string, unknown>>(
    query: string,
    options: SearchOptions = {},
  ): Promise<{ data: T[]; total: number }> {
    return this.searchTable<T>('health_tasks', ['title', 'description'], query, options);
  }

  async fullTextSearch<T>(
    tableName: string,
    searchFields: string[],
    query: string,
    options: {
      limit?: number;
      offset?: number;
      filters?: Record<string, QueryParamValue>;
      orderBy?: string;
    } = {},
  ): Promise<{ data: T[]; total: number }> {
    const { limit = 10, offset = 0, filters = {}, orderBy } = options;

    const formattedQuery = query
      .trim()
      .split(/\s+/)
      .map(term => `${term}:*`)
      .join(' & ');

    const fieldsToSearch = searchFields.join(" || ' ' || ");
    const searchVector = `to_tsvector('english', ${fieldsToSearch})`;
    const searchQuery = `to_tsquery('english', $1)`;

    let whereClause = `${searchVector} @@ ${searchQuery}`;
    const parameters: QueryParamValue[] = [formattedQuery];

    let paramIndex = 2;
    for (const [key, value] of Object.entries(filters)) {
      whereClause += ` AND "${key}" = $${paramIndex}`;
      parameters.push(value);
      paramIndex++;
    }

    const rankExpression = `ts_rank(${searchVector}, ${searchQuery})`;
    const selectQuery = `
      SELECT *, ${rankExpression} AS rank
      FROM "${tableName}"
      WHERE ${whereClause}
      ORDER BY ${orderBy || 'rank DESC'}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM "${tableName}"
      WHERE ${whereClause}
    `;

    try {
      const [results, countResult] = await Promise.all([
        this.dataSource.query(selectQuery, [...parameters, limit, offset]),
        this.dataSource.query(countQuery, parameters),
      ]);

      return {
        data: results,
        total: parseInt(countResult[0].total, 10),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Search failed for table ${tableName}: ${message}`);
      throw error;
    }
  }

  private async searchTable<T>(
    tableName: string,
    searchFields: string[],
    query: string,
    options: SearchOptions = {},
  ): Promise<{ data: T[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      filters = {},
      orderBy,
      fuzzy = true,
    } = options;

    const whereClauses: string[] = [];
    const parameters: QueryParamValue[] = [];
    let rankExpression = '1';

    if (query?.trim()) {
      if (fuzzy) {
        const fuzzySearch = this.buildFuzzySearchClause(searchFields, query, 1);
        whereClauses.push(fuzzySearch.whereClause);
        parameters.push(...fuzzySearch.parameters);
        rankExpression = fuzzySearch.rankExpression;
      } else {
        const formattedQuery = query
          .trim()
          .split(/\s+/)
          .map(term => `${term}:*`)
          .join(' & ');

        const fieldsToSearch = searchFields
          .map(field => `coalesce("${field}", '')`)
          .join(" || ' ' || ");

        whereClauses.push(`to_tsvector('english', ${fieldsToSearch}) @@ to_tsquery('english', $1)`);
        parameters.push(formattedQuery);
        rankExpression = `ts_rank(to_tsvector('english', ${fieldsToSearch}), to_tsquery('english', $1))`;
      }
    }

    const filterClause = this.buildFilterClause(filters, parameters.length + 1);
    if (filterClause.clause) {
      whereClauses.push(filterClause.clause);
      parameters.push(...filterClause.parameters);
    }

    const whereClause = whereClauses.length > 0 ? whereClauses.join(' AND ') : 'TRUE';
    const orderClause = orderBy || (query?.trim() ? 'rank DESC' : 'id DESC');

    const selectQuery = `
      SELECT *, ${rankExpression} AS rank
      FROM "${tableName}"
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM "${tableName}"
      WHERE ${whereClause}
    `;

    try {
      const [results, countResult] = await Promise.all([
        this.dataSource.query(selectQuery, [...parameters, limit, offset]),
        this.dataSource.query(countQuery, parameters),
      ]);

      return {
        data: results,
        total: parseInt(countResult[0].total, 10),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Search failed for table ${tableName}: ${message}`);
      throw error;
    }
  }

  private buildFuzzySearchClause(
    searchFields: string[],
    query: string,
    startIndex: number,
  ): { whereClause: string; parameters: QueryParamValue[]; rankExpression: string } {
    const trimmedQuery = query.trim();
    const fuzzyQuery = `%${trimmedQuery}%`;
    const prefixQuery = `${trimmedQuery}%`;

    const whereParts: string[] = [];
    const rankComponents: string[] = [];

    for (const field of searchFields) {
      whereParts.push(`similarity("${field}", $${startIndex}) > 0.3`);
      whereParts.push(`"${field}" ILIKE $${startIndex + 1}`);
      whereParts.push(`"${field}" ILIKE $${startIndex + 2}`);

      rankComponents.push(
        `GREATEST(similarity("${field}", $${startIndex}), CASE WHEN "${field}" ILIKE $${startIndex + 1} THEN 0.8 ELSE 0 END, CASE WHEN "${field}" ILIKE $${startIndex + 2} THEN 0.95 ELSE 0 END)`,
      );
    }

    return {
      whereClause: `(${whereParts.join(' OR ')})`,
      parameters: [trimmedQuery, fuzzyQuery, prefixQuery],
      rankExpression: `GREATEST(${rankComponents.join(', ')})`,
    };
  }

  private buildFilterClause(filters: Record<string, QueryParamValue>, startIndex: number) {
    const clauses: string[] = [];
    const parameters: QueryParamValue[] = [];

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) {
        continue;
      }

      clauses.push(`"${key}" = $${startIndex}`);
      parameters.push(value);
      startIndex++;
    }

    return {
      clause: clauses.join(' AND '),
      parameters,
    };
  }
}
