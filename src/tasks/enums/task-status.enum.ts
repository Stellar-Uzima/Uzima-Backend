export enum TaskStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Health tasks follow a linear lifecycle:
 * DRAFT -> ACTIVE -> ARCHIVED
 *
 * This makes the valid transitions explicit and allows the service layer to
 * reject illegal state changes consistently before a save occurs.
 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.DRAFT]: [TaskStatus.ACTIVE],
  [TaskStatus.ACTIVE]: [TaskStatus.ARCHIVED],
  [TaskStatus.ARCHIVED]: [],
};

export function isValidTaskStatusTransition(
  from: TaskStatus,
  to: TaskStatus,
): boolean {
  return (TASK_STATUS_TRANSITIONS[from] ?? []).includes(to);
}
