// Fixed metadata for parameters.confidence_tier (constraint #4). This is a lookup over
// a small, closed set of tier VALUES the registry schema itself defines -- it is not
// registry content (no hazard name, figure, date, or citation lives here), it is UI
// copy describing what each tier means, worded once and reused everywhere a tier
// appears so the explanation never drifts per-instance. 'measured' is the only tier
// that renders with no icon at all; the other three always get the hourglass.

const TIERS = {
  measured: {
    icon: null,
    label: 'Measured',
    explanation: 'Directly measured or field-quantified for this hazard/mitigation pair.',
  },
  meta_analytic_relative: {
    icon: '⏳',
    label: 'Meta-analytic (relative effect)',
    explanation:
      'A relative statistical effect size pooled across many studies (a meta-analysis), not a site-measured physical reduction for this location. Indicates direction and robustness of effect, not a precise figure to plan against.',
  },
  provisional_approximation: {
    icon: '⏳',
    label: 'Provisional approximation',
    explanation:
      'A reasoned approximation carried over from a structurally similar system or study (a proxy), not a direct measurement of this exact hazard/mitigation pair.',
  },
  provisional_zero_default: {
    icon: '⏳',
    label: 'No registry data',
    explanation:
      'No relationship or documented data gap exists in the registry for this hazard/mitigation pair. Shown as zero effect by default -- this is an absence of evidence, not evidence of zero effect.',
  },
};

const FALLBACK = {
  icon: '⏳',
  label: 'Unclassified confidence',
  explanation: 'This parameter has a confidence_tier value not yet described in the app -- treat with caution.',
};

export function tierInfo(tier) {
  return TIERS[tier] || FALLBACK;
}

/** Returns a DOM node: an hourglass badge for any non-'measured' tier, or an empty
 * (but valid, appendable) fragment for 'measured' so callers can always append the
 * result without a conditional. */
export function confidenceBadge(tier) {
  const info = tierInfo(tier);
  if (!info.icon) return document.createDocumentFragment();

  const badge = document.createElement('span');
  badge.className = 'confidence-badge';
  badge.tabIndex = 0;
  badge.textContent = `${info.icon} ${info.label}`;
  badge.title = info.explanation;

  const detail = document.createElement('div');
  detail.className = 'confidence-detail';
  detail.hidden = true;
  detail.textContent = info.explanation;

  badge.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
  });
  badge.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      detail.hidden = !detail.hidden;
    }
  });

  const container = document.createElement('span');
  container.className = 'confidence-container';
  container.appendChild(badge);
  container.appendChild(detail);
  return container;
}

/** Visible "PROXY" tag (constraint #5) -- shown wherever a value derived from a
 * PROXY relationship is displayed, not just in a hover tooltip. */
export function proxyTag() {
  const tag = document.createElement('span');
  tag.className = 'proxy-flag';
  tag.title = 'Applied by reasoned analogy from a study on a structurally similar system, not measured on this system directly';
  tag.textContent = 'PROXY';
  return tag;
}

export function isProxy(applicationNotes) {
  return /^PROXY:/.test(applicationNotes || '');
}
