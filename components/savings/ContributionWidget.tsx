import React, { useState } from 'react';

export interface ContributionWidgetProps {
  /** Callback when the user submits a contribution */
  onContribute?: (amount: number) => void;
  /** Currency label displayed next to the input */
  currency?: string;
}

/**
 * A contribution widget that allows users to enter a monetary amount
 * for savings contributions. Uses inputMode="decimal" to show a
 * numeric keyboard on mobile devices.
 */
const ContributionWidget: React.FC<ContributionWidgetProps> = ({
  onContribute,
  currency = 'USD',
}) => {
  const [amount, setAmount] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!isNaN(parsed) && parsed > 0) {
      onContribute?.(parsed);
    }
  };

  return (
    <form
      className="contribution-widget"
      onSubmit={handleSubmit}
      aria-label="Contribution amount"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--contribution-widget-spacing, 0.75rem)',
        padding: 'var(--contribution-widget-padding, 1rem)',
        borderRadius: 'var(--contribution-widget-radius, 12px)',
        border: '1px solid var(--contribution-widget-border, #e5e7eb)',
        backgroundColor:
          'var(--contribution-widget-bg, #ffffff)',
      }}
    >
      <label
        htmlFor="contribution-amount"
        style={{
          fontSize: 'var(--contribution-widget-label-size, 0.875rem)',
          fontWeight: 'var(--contribution-widget-label-weight, 500)',
          color: 'var(--contribution-widget-label-color, #1f2937)',
        }}
      >
        Contribution Amount
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          id="contribution-amount"
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          aria-label={`Amount in ${currency}`}
          style={{
            flex: 1,
            padding: 'var(--contribution-widget-input-padding, 0.625rem 0.75rem)',
            fontSize: 'var(--contribution-widget-input-size, 1rem)',
            borderRadius: 'var(--contribution-widget-input-radius, 8px)',
            border: '1px solid var(--contribution-widget-input-border, #d1d5db)',
            outline: 'none',
          }}
        />

        <span
          style={{
            fontSize: 'var(--contribution-widget-currency-size, 0.875rem)',
            color: 'var(--contribution-widget-currency-color, #6b7280)',
            fontWeight: 500,
          }}
        >
          {currency}
        </span>
      </div>

      <button
        type="submit"
        disabled={!amount || parseFloat(amount) <= 0}
        aria-label="Submit contribution"
        style={{
          padding: 'var(--contribution-widget-button-padding, 0.625rem 1.25rem)',
          fontSize: 'var(--contribution-widget-button-size, 0.875rem)',
          fontWeight: 'var(--contribution-widget-button-weight, 500)',
          color: 'var(--contribution-widget-button-color, #ffffff)',
          backgroundColor: 'var(--contribution-widget-button-bg, #e68a00)',
          border: 'none',
          borderRadius: 'var(--contribution-widget-button-radius, 8px)',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor =
            'var(--contribution-widget-button-hover, #cc7a00)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor =
            'var(--contribution-widget-button-bg, #e68a00)';
        }}
      >
        Contribute
      </button>
    </form>
  );
};

export default ContributionWidget;
