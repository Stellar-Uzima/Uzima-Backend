/**
 * Verification workflow for regulated/high-risk account actions (#1340).
 * Defines the enforceable states and legal transitions between them so
 * callers can validate a status change before persisting it.
 */
export enum VerificationStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

const ALLOWED_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  [VerificationStatus.PENDING]: [VerificationStatus.UNDER_REVIEW],
  [VerificationStatus.UNDER_REVIEW]: [VerificationStatus.VERIFIED, VerificationStatus.REJECTED],
  [VerificationStatus.VERIFIED]: [],
  [VerificationStatus.REJECTED]: [VerificationStatus.PENDING],
};

export interface VerificationReview {
  status: VerificationStatus;
  approverId: string;
  reviewedAt: Date;
}

export function canTransitionVerification(
  from: VerificationStatus,
  to: VerificationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertApprovedReview(review: VerificationReview): void {
  if (!review.approverId) {
    throw new Error('Verification review must be tied to an approver');
  }
}
