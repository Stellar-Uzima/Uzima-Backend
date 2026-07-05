/**
 * Transaction Service Examples
 * 
 * This file contains examples of how to use the TransactionService.
 * These are reference examples and are not imported by the application.
 */

export const TRANSACTION_EXAMPLES = {
  basic: `
    const result = await transactionService.execute(contextId, async (queryRunner) => {
      // Your transactional logic here
      return result;
    });
  `,
  nested: `
    // Nested transactions using savepoints
    const result = await transactionService.execute(contextId, async (queryRunner) => {
      // Outer transaction
      return result;
    });
  `,
};