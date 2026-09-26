import { Currency } from '../shared/currency/currency.enum';

/**
 * Actions performed by a referred user that unlock the referrer's reward.
 *
 * Only actions listed here qualify: the settlement service refuses to credit a
 * referral for anything else, so adding a new payout path is a deliberate,
 * reviewed change rather than an implicit side effect of unrelated events.
 */
export enum ReferralQualifyingAction {
  /** The referred user's first health task completion was verified. */
  FIRST_HEALTH_TASK_COMPLETION = 'FIRST_HEALTH_TASK_COMPLETION',
}

/** Allow-list of every action that can unlock a referral reward. */
export const REFERRAL_QUALIFYING_ACTIONS: readonly ReferralQualifyingAction[] =
  Object.values(ReferralQualifyingAction);

export function isReferralQualifyingAction(
  value: unknown,
): value is ReferralQualifyingAction {
  return (
    typeof value === 'string' &&
    (REFERRAL_QUALIFYING_ACTIONS as readonly string[]).includes(value)
  );
}

/** Machine-readable outcome of a settlement attempt. */
export enum ReferralSettlementReason {
  SETTLED = 'SETTLED',
  /** A previous (possibly concurrent) settlement already paid this referral. */
  ALREADY_SETTLED = 'ALREADY_SETTLED',
  /** The user never redeemed a referral code, so there is nothing to settle. */
  NO_REFERRAL = 'NO_REFERRAL',
  /** The action is not in the qualifying-action allow-list. */
  INELIGIBLE_ACTION = 'INELIGIBLE_ACTION',
  /** Referrer and referred user are the same account. */
  INELIGIBLE_SELF_REFERRAL = 'INELIGIBLE_SELF_REFERRAL',
  /** The referrer account is missing or no longer active. */
  INELIGIBLE_REFERRER = 'INELIGIBLE_REFERRER',
  /** The requested reward amount is not a positive finite number. */
  INVALID_AMOUNT = 'INVALID_AMOUNT',
}

/** Env var that overrides the default referral reward amount. */
export const REFERRAL_REWARD_AMOUNT_ENV = 'REFERRAL_REWARD_XLM';

/** Default referral reward, in XLM, when the env var is absent or invalid. */
export const DEFAULT_REFERRAL_REWARD_XLM = 5;

export const DEFAULT_REFERRAL_REWARD_CURRENCY = Currency.XLM;
