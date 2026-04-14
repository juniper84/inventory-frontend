'use client';

type Props = {
  funnel: {
    trialStarted: number;
    converted: number;
    dropOff: number;
  };
  t: (key: string, values?: Record<string, string | number>) => string;
};

/**
 * SVG funnel visualization: trial started → converted, with drop-off count.
 * Width at each stage scales with the count. Uses theme-aware gold + red.
 */
export function ConversionFunnel({ funnel, t }: Props) {
  const maxValue = Math.max(
    funnel.trialStarted,
    funnel.converted,
    funnel.dropOff,
    1,
  );
  const conversionRate =
    funnel.trialStarted > 0
      ? ((funnel.converted / funnel.trialStarted) * 100).toFixed(1)
      : '0.0';

  const trialWidth = Math.max(80, (funnel.trialStarted / maxValue) * 320);
  const convWidth = Math.max(40, (funnel.converted / maxValue) * 320);

  return (
    <div className="space-y-3">
      {/* Funnel SVG */}
      <svg
        width="100%"
        height="180"
        viewBox="0 0 400 180"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Top: Trial started */}
        <g>
          <polygon
            points={`${200 - trialWidth / 2},10 ${200 + trialWidth / 2},10 ${200 + convWidth / 2},90 ${200 - convWidth / 2},90`}
            fill="var(--pt-accent-dim)"
            stroke="var(--pt-accent-border)"
            strokeWidth="1"
          />
          <text
            x="200"
            y="38"
            fontSize="11"
            fill="var(--pt-text-muted)"
            textAnchor="middle"
            fontFamily="'Space Grotesk', system-ui, sans-serif"
            style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
          >
            {t('funnelTrialStarted')}
          </text>
          <text
            x="200"
            y="65"
            fontSize="20"
            fill="var(--pt-text-1)"
            textAnchor="middle"
            fontWeight="700"
            fontFamily="'Space Grotesk', system-ui, sans-serif"
          >
            {funnel.trialStarted}
          </text>
        </g>

        {/* Bottom: Converted */}
        <g>
          <rect
            x={200 - convWidth / 2}
            y="100"
            width={convWidth}
            height="70"
            rx="4"
            fill="rgba(61,186,106,0.15)"
            stroke="rgba(61,186,106,0.4)"
            strokeWidth="1"
          />
          <text
            x="200"
            y="122"
            fontSize="11"
            fill="rgba(61,186,106,0.9)"
            textAnchor="middle"
            fontFamily="'Space Grotesk', system-ui, sans-serif"
            style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
          >
            {t('funnelConverted')}
          </text>
          <text
            x="200"
            y="150"
            fontSize="20"
            fill="rgba(61,186,106,1)"
            textAnchor="middle"
            fontWeight="700"
            fontFamily="'Space Grotesk', system-ui, sans-serif"
          >
            {funnel.converted}
          </text>
        </g>

        {/* Conversion rate badge */}
        <g>
          <rect
            x="310"
            y="80"
            width="80"
            height="24"
            rx="12"
            fill="var(--pt-accent)"
          />
          <text
            x="350"
            y="96"
            fontSize="12"
            fill="black"
            textAnchor="middle"
            fontWeight="700"
            fontFamily="'Space Grotesk', system-ui, sans-serif"
          >
            {conversionRate}%
          </text>
        </g>
      </svg>

      {/* Drop-off stat */}
      <div className="flex items-center justify-center gap-6 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('funnelConversionRate')}
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--pt-accent)]">
            {conversionRate}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
            {t('funnelDropOff')}
          </p>
          <p className="mt-1 text-lg font-bold text-red-400">
            {funnel.dropOff}
          </p>
        </div>
      </div>
    </div>
  );
}
