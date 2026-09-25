export enum Role {
  USER = 'USER',
  HEALER = 'HEALER',
  /**
   * Support agent. Can read user data and manage operational state, but cannot
   * change roles, delete accounts, or read audit trails.
   */
  SUPPORT = 'SUPPORT',
  ADMIN = 'ADMIN',
}
