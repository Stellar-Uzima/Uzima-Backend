import React from 'react';

export type IllustrationType = 'tasks' | 'rewards' | 'consultations' | 'history';

export interface EmptyStateProps {
  /** The main heading text */
  title: string;
  /** Helpful description text */
  description: string;
  /** Optional CTA button label */
  ctaLabel?: string;
  /** Optional callback for CTA button click */
  onCtaClick?: () => void;
  /** The type of illustration to display */
  illustration: IllustrationType;
}

/**
 * A reusable empty state component with culturally warm SVG illustrations.
 * Provides accessible, friendly messaging when content is unavailable.
 * Supports light and dark modes.
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  ctaLabel,
  onCtaClick,
  illustration,
}) => {
  const renderIllustration = () => {
    const baseProps = {
      width: 120,
      height: 120,
      viewBox: '0 0 120 120',
      className: 'empty-state-illustration',
      'aria-hidden': true,
    };

    switch (illustration) {
      case 'tasks':
        return (
          <svg {...baseProps}>
            <circle cx="60" cy="60" r="50" fill="var(--empty-state-bg, #fef3e2)" />
            <rect x="35" y="30" width="50" height="8" rx="4" fill="var(--empty-state-accent, #e68a00)" />
            <rect x="35" y="45" width="40" height="8" rx="4" fill="var(--empty-state-muted, #d4a574)" />
            <rect x="35" y="60" width="45" height="8" rx="4" fill="var(--empty-state-muted, #d4a574)" />
            <rect x="35" y="75" width="30" height="8" rx="4" fill="var(--empty-state-muted, #d4a574)" />
            <circle cx="85" cy="85" r="15" fill="var(--empty-state-accent, #e68a00)" opacity="0.3" />
          </svg>
        );

      case 'rewards':
        return (
          <svg {...baseProps}>
            <circle cx="60" cy="60" r="50" fill="var(--empty-state-bg, #fef3e2)" />
            <path
              d="M60 20 L65 40 L85 40 L70 52 L75 72 L60 60 L45 72 L50 52 L35 40 L55 40 Z"
              fill="var(--empty-state-accent, #e68a00)"
            />
            <circle cx="60" cy="60" r="8" fill="var(--empty-state-bg, #fef3e2)" />
            <circle cx="60" cy="60" r="4" fill="var(--empty-state-accent, #e68a00)" />
          </svg>
        );

      case 'consultations':
        return (
          <svg {...baseProps}>
            <circle cx="60" cy="60" r="50" fill="var(--empty-state-bg, #fef3e2)" />
            <circle cx="45" cy="50" r="12" fill="var(--empty-state-accent, #e68a00)" />
            <circle cx="75" cy="50" r="12" fill="var(--empty-state-muted, #d4a574)" />
            <path
              d="M30 80 Q45 70 60 80 Q75 90 90 80"
              stroke="var(--empty-state-accent, #e68a00)"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
            <rect x="38" y="46" width="14" height="8" rx="2" fill="var(--empty-state-bg, #fef3e2)" />
            <rect x="68" y="46" width="14" height="8" rx="2" fill="var(--empty-state-bg, #fef3e2)" />
          </svg>
        );

      case 'history':
        return (
          <svg {...baseProps}>
            <circle cx="60" cy="60" r="50" fill="var(--empty-state-bg, #fef3e2)" />
            <circle cx="60" cy="35" r="20" fill="none" stroke="var(--empty-state-accent, #e68a00)" strokeWidth="4" />
            <path d="M60 25 L60 35 L68 40" stroke="var(--empty-state-accent, #e68a00)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <rect x="35" y="65" width="50" height="4" rx="2" fill="var(--empty-state-muted, #d4a574)" />
            <rect x="35" y="75" width="35" height="4" rx="2" fill="var(--empty-state-muted, #d4a574)" />
            <rect x="35" y="85" width="42" height="4" rx="2" fill="var(--empty-state-muted, #d4a574)" />
          </svg>
        );

      default:
        return null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCtaClick?.();
    }
  };

  return (
    <div
      className="empty-state-container"
      role="region"
      aria-labelledby="empty-state-title"
      aria-describedby="empty-state-description"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--empty-state-padding, 2rem)',
        textAlign: 'center',
        minHeight: '200px',
        backgroundColor: 'var(--empty-state-container-bg, #ffffff)',
        borderRadius: 'var(--empty-state-border-radius, 12px)',
        border: '1px solid var(--empty-state-border, #e5e7eb)',
      }}
    >
      <div
        className="empty-state-illustration-wrapper"
        style={{
          marginBottom: 'var(--empty-state-spacing, 1.5rem)',
        }}
      >
        {renderIllustration()}
      </div>

      <h2
        id="empty-state-title"
        style={{
          fontSize: 'var(--empty-state-title-size, 1.25rem)',
          fontWeight: 'var(--empty-state-title-weight, 600)',
          color: 'var(--empty-state-title-color, #1f2937)',
          margin: '0 0 0.5rem 0',
          lineHeight: 1.4,
        }}
      >
        {title}
      </h2>

      <p
        id="empty-state-description"
        style={{
          fontSize: 'var(--empty-state-description-size, 0.875rem)',
          color: 'var(--empty-state-description-color, #6b7280)',
          margin: '0 0 1.5rem 0',
          maxWidth: '300px',
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>

      {ctaLabel && onCtaClick && (
        <button
          onClick={onCtaClick}
          onKeyDown={handleKeyDown}
          aria-label={`${ctaLabel}. ${description}`}
          style={{
            padding: 'var(--empty-state-button-padding, 0.625rem 1.25rem)',
            fontSize: 'var(--empty-state-button-size, 0.875rem)',
            fontWeight: 'var(--empty-state-button-weight, 500)',
            color: 'var(--empty-state-button-color, #ffffff)',
            backgroundColor: 'var(--empty-state-button-bg, #e68a00)',
            border: 'none',
            borderRadius: 'var(--empty-state-button-radius, 8px)',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease, transform 0.1s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--empty-state-button-hover, #cc7a00)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--empty-state-button-bg, #e68a00)';
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = '2px solid var(--empty-state-focus, #e68a00)';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
