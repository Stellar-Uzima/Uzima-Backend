import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, Like, Not, IsNull } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { UserSearchDto, UserSearchResponseDto, UserSearchResultDto } from '../dto/user-search.dto';
import { Role } from '../../../auth/enums/role.enum';
import { UserStatus } from '../../../auth/enums/user-status.enum';
import { SortOrder } from '../../../common/dtos/pagination.dto';

@Injectable()
export class UserSearchService {
  private readonly logger = new Logger(UserSearchService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Search users with fuzzy matching and filtering
   * @param searchDto - Search parameters and filters
   * @returns Paginated search results with metadata
   */
  async searchUsers(searchDto: UserSearchDto): Promise<UserSearchResponseDto> {
    const startTime = Date.now();
    
    const {
      query,
      fuzzy = true,
      role,
      status,
      isVerified,
      country,
      preferredLanguage,
      hasPhone,
      hasAvatar,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = SortOrder.DESC,
    } = searchDto;

    // Build base query
    let queryBuilder = this.userRepository.createQueryBuilder('user');

    // Apply filters
    queryBuilder = this.applyFilters(queryBuilder, {
      role,
      status,
      isVerified,
      country,
      preferredLanguage,
      hasPhone,
      hasAvatar,
    });

    // Apply search conditions
    if (query) {
      queryBuilder = fuzzy 
        ? this.applyFuzzySearch(queryBuilder, query)
        : this.applyExactSearch(queryBuilder, query);
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply sorting
    queryBuilder = this.applySorting(queryBuilder, sortBy, sortOrder);

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    // Execute query
    const users = await queryBuilder.getMany();

    // Calculate relevance scores if search query is provided
    const results = query 
      ? this.calculateRelevanceScores(users, query, fuzzy)
      : users.map(user => this.mapToSearchResult(user));

    // Sort by relevance score if search query is provided
    if (query && fuzzy) {
      results.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    const executionTime = Date.now() - startTime;

    return {
      results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query,
      executionTimeMs: executionTime,
      fuzzyUsed: fuzzy && !!query,
    };
  }

  /**
   * Apply filters to the query builder
   */
  private applyFilters(
    queryBuilder: SelectQueryBuilder<User>,
    filters: {
      role?: Role;
      status?: UserStatus;
      isVerified?: boolean;
      country?: string;
      preferredLanguage?: string;
      hasPhone?: boolean;
      hasAvatar?: boolean;
    },
  ): SelectQueryBuilder<User> {
    const {
      role,
      status,
      isVerified,
      country,
      preferredLanguage,
      hasPhone,
      hasAvatar,
    } = filters;

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (status) {
      queryBuilder.andWhere('user.status = :status', { status });
    }

    if (isVerified !== undefined) {
      queryBuilder.andWhere('user.isVerified = :isVerified', { isVerified });
    }

    if (country) {
      queryBuilder.andWhere('user.country = :country', { country });
    }

    if (preferredLanguage) {
      queryBuilder.andWhere('user.preferredLanguage = :preferredLanguage', { preferredLanguage });
    }

    if (hasPhone !== undefined) {
      if (hasPhone) {
        queryBuilder.andWhere('user.phoneNumber IS NOT NULL AND user.phoneNumber != \'\'');
      } else {
        queryBuilder.andWhere('(user.phoneNumber IS NULL OR user.phoneNumber = \'\')');
      }
    }

    if (hasAvatar !== undefined) {
      if (hasAvatar) {
        queryBuilder.andWhere('user.walletAddress IS NOT NULL AND user.walletAddress != \'\'');
      } else {
        queryBuilder.andWhere('(user.walletAddress IS NULL OR user.walletAddress = \'\')');
      }
    }

    return queryBuilder;
  }

  /**
   * Apply exact search conditions
   */
  private applyExactSearch(
    queryBuilder: SelectQueryBuilder<User>,
    query: string,
  ): SelectQueryBuilder<User> {
    const searchQuery = `%${query.trim()}%`;
    
    queryBuilder.andWhere(
      `(user.email ILIKE :searchQuery OR 
        user.firstName ILIKE :searchQuery OR 
        user.lastName ILIKE :searchQuery OR 
        user.fullName ILIKE :searchQuery)`,
      { searchQuery }
    );

    return queryBuilder;
  }

  /**
   * Apply fuzzy search conditions with multiple matching strategies
   */
  private applyFuzzySearch(
    queryBuilder: SelectQueryBuilder<User>,
    query: string,
  ): SelectQueryBuilder<User> {
    const trimmedQuery = query.trim();
    const searchTerms = trimmedQuery.split(/\s+/).filter(term => term.length > 0);

    // If query contains multiple words, treat them as separate search terms
    if (searchTerms.length > 1) {
      // Multi-term search - look for users containing all terms in any field
      const conditions = searchTerms.map((term, index) => {
        const paramName = `searchTerm${index}`;
        const searchTerm = `%${term}%`;
        return `(user.email ILIKE :${paramName} OR 
                user.firstName ILIKE :${paramName} OR 
                user.lastName ILIKE :${paramName} OR 
                user.fullName ILIKE :${paramName})`;
      });

      const whereClause = conditions.join(' AND ');
      const parameters = searchTerms.reduce((params, term, index) => {
        params[`searchTerm${index}`] = `%${term}%`;
        return params;
      }, {} as Record<string, string>);

      queryBuilder.andWhere(`(${whereClause})`, parameters);
    } else {
      // Single term search - use multiple fuzzy matching strategies
      const singleTerm = searchTerms[0];
      const fuzzyTerm = `%${singleTerm}%`;
      
      queryBuilder.andWhere(
        `(user.email ILIKE :fuzzyTerm OR 
          user.firstName ILIKE :fuzzyTerm OR 
          user.lastName ILIKE :fuzzyTerm OR 
          user.fullName ILIKE :fuzzyTerm OR
          user.firstName ILIKE :startsWithTerm OR
          user.lastName ILIKE :startsWithTerm OR
          user.fullName ILIKE :startsWithTerm)`,
        {
          fuzzyTerm,
          startsWithTerm: `${singleTerm}%`,
        }
      );
    }

    return queryBuilder;
  }

  /**
   * Apply sorting to the query builder
   */
  private applySorting(
    queryBuilder: SelectQueryBuilder<User>,
    sortBy: string,
    sortOrder: SortOrder,
  ): SelectQueryBuilder<User> {
    const validSortFields = [
      'id',
      'email',
      'firstName',
      'lastName',
      'fullName',
      'role',
      'status',
      'isVerified',
      'createdAt',
      'updatedAt',
      'lastActiveAt',
      'country',
      'preferredLanguage',
    ];

    const field = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const direction = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    queryBuilder.addOrderBy(`user.${field}`, direction);

    // Add secondary sorting for consistent results
    if (field !== 'id') {
      queryBuilder.addOrderBy('user.id', 'ASC');
    }

    return queryBuilder;
  }

  /**
   * Calculate relevance scores for search results
   */
  private calculateRelevanceScores(
    users: User[],
    query: string,
    fuzzy: boolean,
  ): UserSearchResultDto[] {
    const searchTerms = query.trim().toLowerCase().split(/\s+/);
    
    return users.map(user => {
      const result = this.mapToSearchResult(user);
      
      if (!fuzzy) {
        return result;
      }

      let score = 0;
      const email = user.email?.toLowerCase() || '';
      const firstName = user.firstName?.toLowerCase() || '';
      const lastName = user.lastName?.toLowerCase() || '';
      const fullName = user.fullName?.toLowerCase() || '';

      searchTerms.forEach(term => {
        // Exact matches get highest score
        if (email === term) score += 1.0;
        if (firstName === term) score += 0.9;
        if (lastName === term) score += 0.9;
        if (fullName === term) score += 0.95;

        // Starts with matches get high score
        if (email.startsWith(term)) score += 0.8;
        if (firstName.startsWith(term)) score += 0.7;
        if (lastName.startsWith(term)) score += 0.7;
        if (fullName.startsWith(term)) score += 0.75;

        // Contains matches get medium score
        if (email.includes(term)) score += 0.5;
        if (firstName.includes(term)) score += 0.4;
        if (lastName.includes(term)) score += 0.4;
        if (fullName.includes(term)) score += 0.45;

        // Levenshtein distance for fuzzy matching (simplified)
        if (this.calculateSimilarity(firstName, term) > 0.7) score += 0.3;
        if (this.calculateSimilarity(lastName, term) > 0.7) score += 0.3;
        if (this.calculateSimilarity(fullName, term) > 0.7) score += 0.35;
      });

      // Normalize score to 0-1 range
      result.score = Math.min(score / searchTerms.length, 1.0);
      
      return result;
    });
  }

  /**
   * Calculate string similarity using simplified Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,        // deletion
          matrix[j - 1][i] + 1,        // insertion
          matrix[j - 1][i - 1] + indicator, // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Map User entity to SearchResultDto
   */
  private mapToSearchResult(user: User): UserSearchResultDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      avatar: user.walletAddress, // Assuming avatar is stored in walletAddress
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
      country: user.country,
      preferredLanguage: user.preferredLanguage,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Get search suggestions based on partial input
   * @param partial - Partial search term
   * @param limit - Maximum number of suggestions
   * @returns Array of search suggestions
   */
  async getSearchSuggestions(partial: string, limit: number = 10): Promise<string[]> {
    if (!partial || partial.length < 2) {
      return [];
    }

    const searchPattern = `%${partial}%`;
    
    const users = await this.userRepository
      .createQueryBuilder('user')
      .select(['user.firstName', 'user.lastName', 'user.fullName', 'user.email'])
      .where('user.firstName ILIKE :pattern OR user.lastName ILIKE :pattern OR user.fullName ILIKE :pattern', {
        pattern: searchPattern,
      })
      .limit(limit * 3) // Get more results to filter unique suggestions
      .getMany();

    const suggestions = new Set<string>();

    users.forEach(user => {
      // Add first name if it matches
      if (user.firstName && user.firstName.toLowerCase().includes(partial.toLowerCase())) {
        suggestions.add(user.firstName);
      }
      
      // Add last name if it matches
      if (user.lastName && user.lastName.toLowerCase().includes(partial.toLowerCase())) {
        suggestions.add(user.lastName);
      }
      
      // Add full name if it matches
      if (user.fullName && user.fullName.toLowerCase().includes(partial.toLowerCase())) {
        suggestions.add(user.fullName);
      }
    });

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Get popular search terms (could be implemented with analytics data)
   * @param limit - Maximum number of popular terms
   * @returns Array of popular search terms
   */
  async getPopularSearchTerms(limit: number = 10): Promise<string[]> {
    // This could be implemented with a search analytics table
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Get search statistics
   * @returns Search performance and usage statistics
   */
  async getSearchStats(): Promise<{
    totalUsers: number;
    searchableFields: string[];
    averageSearchTime?: number;
    popularFilters?: Record<string, number>;
  }> {
    const totalUsers = await this.userRepository.count();
    
    return {
      totalUsers,
      searchableFields: ['email', 'firstName', 'lastName', 'fullName'],
      // These would be populated from analytics in a real implementation
      averageSearchTime: undefined,
      popularFilters: undefined,
    };
  }
}
