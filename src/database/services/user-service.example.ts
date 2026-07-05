/**
 * User Service Examples
 * 
 * This file contains reference examples for using the TransactionService
 * with user-related operations. Not imported by the application.
 */

export const USER_SERVICE_EXAMPLES = {
  createUser: `
    const result = await transactionService.execute(contextId, async (queryRunner) => {
      // Create user and profile in a transaction
      return { user, profile };
    });
  `,
};