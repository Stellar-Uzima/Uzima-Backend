/**
 * Granular permission flags for fine-grained access control.
 * Extends role-based authorization with resource-level permissions.
 */
export enum Permission {
  /** Read/view health records */
  READ_RECORDS = 'READ_RECORDS',
  /** Create or modify health records */
  WRITE_RECORDS = 'WRITE_RECORDS',
  /** Delete health records */
  DELETE_RECORDS = 'DELETE_RECORDS',

  /** View user profiles */
  READ_USERS = 'READ_USERS',
  /** Create or update user profiles */
  WRITE_USERS = 'WRITE_USERS',
  /** Delete user accounts */
  DELETE_USERS = 'DELETE_USERS',

  /** Manage system-wide settings */
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  /** Access admin dashboard */
  ACCESS_ADMIN = 'ACCESS_ADMIN',
  /** View analytics and reports */
  VIEW_ANALYTICS = 'VIEW_ANALYTICS',

  /** Create tasks */
  CREATE_TASKS = 'CREATE_TASKS',
  /** Assign tasks to users */
  ASSIGN_TASKS = 'ASSIGN_TASKS',
  /** Review submitted tasks */
  REVIEW_TASKS = 'REVIEW_TASKS',
}
