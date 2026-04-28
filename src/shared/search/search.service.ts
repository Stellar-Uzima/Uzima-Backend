import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Performs a full-text search on a specific table/entity.
   * @param tableName Name of the table to search in
   * @param searchFields Array of column names to include in search
   * @param query Search query string
   * @param options Additional options like filters, limit, offset
   */
  async fullTextSearch<T>(
    tableName: string,
    searchFields: string[],
    query: string,
    options: {
      limit?: number;
      offset?: number;
      filters?: Record<string, any>;
      orderBy?: string;
    } = {},
  ): Promise<{ data: T[]; total: number }> {
    const { limit = 10, offset = 0, filters = {}, orderBy } = options;

    // Sanitize query for PostgreSQL tsquery
    // Replace spaces with & for AND search, or | for OR search. 
    // Here we use simple prefix matching for better UX.
    const formattedQuery = query
      .trim()
      .split(/\s+/)
      .map(term => `${term}:*`)
      .join(' & ');

    const fieldsToSearch = searchFields.join(' || \' \' || ');
    const searchVector = `to_tsvector('english', ${fieldsToSearch})`;
    const searchQuery = `to_tsquery('english', $1)`;

    let whereClause = `${searchVector} @@ ${searchQuery}`;
    const parameters: any[] = [formattedQuery];

    // Add filters
    let paramIndex = 2;
    for (const [key, value] of Object.entries(filters)) {
      whereClause += ` AND "${key}" = $${paramIndex}`;
      parameters.push(value);
      paramIndex++;
    }

    // Rank results by relevance
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
    } catch (error: any) {
      this.logger.error(`Search failed for table ${tableName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Utility to highlight search terms in results (optional enhancement)
   */
  async getHighlightedSearch<T>(
    tableName: string,
    searchFields: string[],
    query: string,
    id: string | number,
  ): Promise<any> {
    const fieldsToSearch = searchFields.join(' || \' \' || ');
    const formattedQuery = query.trim().split(/\s+/).join(' & ');
    
    const highlightQuery = `
      SELECT ts_headline('english', ${fieldsToSearch}, to_tsquery('english', $1)) as highlight
      FROM "${tableName}"
      WHERE id = $2
    `;

    const result = await this.dataSource.query(highlightQuery, [formattedQuery, id]);
    return result[0]?.highlight;
  }
}
