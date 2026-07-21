export const SITE = {
  name: 'Oxygn',
  domain: 'oxygn.xyz',
  email: 'hello@oxygn.xyz',
  tagline: 'AI-native governance, risk, and compliance for regulated financial institutions.',
} as const;

export const NAV = [
  { label: 'Services', href: '/services' },
  { label: 'Platform', href: '/platform' },
  { label: 'Trust', href: '/trust' },
  { label: 'About', href: '/about' },
  { label: 'Resources', href: '/resources' },
] as const;

export const SERVICES = [
  {
    id: 'governance',
    title: 'Governance',
    description: 'Board pack drafting, policy lifecycle management, regulatory radar, mandatory registers. Four bundles covering every statutory governance obligation.',
    bundles: 'G1–G4',
  },
  {
    id: 'risk',
    title: 'Risk',
    description: 'Enterprise risk framework, operational risk monitoring, financial risk modelling, model validation. Including AI/ML model validation for client-deployed systems.',
    bundles: 'R1–R4',
  },
  {
    id: 'compliance',
    title: 'Compliance',
    description: 'Continuous KYC, transaction monitoring, SAR drafting, sanctions screening, regulatory reporting. MAS-recognised Compliance Officer and MLRO provided as named officers.',
    bundles: 'C1–C4',
  },
  {
    id: 'legal',
    title: 'Legal',
    description: 'Contract suite, regulatory paperwork, corporate-secretarial advisory, employment and IP notices. All outputs supervised by an admitted Singapore lawyer in-house.',
    bundles: 'L1–L4',
  },
  {
    id: 'internal-audit',
    title: 'Internal Audit',
    description: 'Independent third-line assurance. Risk-based audit planning, fieldwork, regulatory submission. IIA-qualified auditors on staff. Operationally separate from Compliance and Risk.',
    bundles: 'IA1–IA3',
  },
  {
    id: 'company-secretary',
    title: 'Company Secretary',
    description: 'Statutory filings, AGM and EGM management, board minutes, ACRA lodgements, share registry. Chartered Secretaries Institute of Singapore qualified. Direct Section 171 appointment.',
    bundles: 'CS1–CS2',
  },
] as const;

export const METRICS = [
  { value: '~1,000', label: 'AI specialist role designs' },
  { value: '~5,000', label: 'Active agent instances' },
  { value: '6', label: 'Service lines' },
  { value: '10–15', label: 'Anchor clients at steady state' },
] as const;

export const CUSTOMER_JOURNEY = [
  { step: '01', title: 'Discovery', description: 'Introduced through our network, our published methodology, or a referral from your professional advisers.' },
  { step: '02', title: 'Scoping', description: 'Joint session to define pillars, services, autonomy levels, cadence, and retention — captured in your MSA annex.' },
  { step: '03', title: 'Onboarding', description: 'Compressed two-week intake: data ingestion, AI workforce provisioning, policy library inception, kickoff.' },
  { step: '04', title: 'Steady-state', description: 'Continuous managed service. Quarterly business reviews. Annual board update. Multi-year renewal cycle.' },
] as const;

export const TRUST_STANDARDS = [
  { title: 'Per-client isolation', description: 'Dedicated AI workforce instance, separate encryption keys, separate audit ledger. No cross-client data flow by architecture, not policy.' },
  { title: 'Singapore data residency', description: 'All client data resident in Singapore-region infrastructure. Per-market residency as we expand to ADGM, Hong Kong, United Kingdom, and DIFC.' },
  { title: 'MAS-aligned posture', description: 'MAS Notice 644 cyber-incident posture. Technology Risk Management Guidelines alignment. Demonstrable to regulators on request.' },
  { title: 'Immutable audit ledger', description: 'Every action witnessed. Every decision traceable through an unbroken authority chain to the founding principles. Cryptographically signed, end-to-end.' },
  { title: 'Human sign-off', description: 'Every regulator-facing output reviewed by a qualified human supervisor before submission. AI amplifies; humans authorise.' },
  { title: 'Right to audit', description: 'Audit Oxygn at any time, without notice, at your reasonable expense. Continuous internal audit plus annual independent external audit.' },
] as const;

export const JURISDICTIONS = [
  { market: 'Singapore', regulator: 'MAS', status: 'Primary domicile' },
  { market: 'Abu Dhabi', regulator: 'FSRA (ADGM)', status: 'Capability maintained' },
  { market: 'Hong Kong', regulator: 'SFC', status: 'Capability maintained' },
  { market: 'United Kingdom', regulator: 'FCA', status: 'Capability maintained' },
  { market: 'Dubai', regulator: 'DFSA (DIFC)', status: 'Secondary market' },
] as const;

export const FOOTER_LINKS = {
  services: [
    { label: 'Governance', href: '/services#governance' },
    { label: 'Risk', href: '/services#risk' },
    { label: 'Compliance', href: '/services#compliance' },
    { label: 'Legal', href: '/services#legal' },
    { label: 'Internal Audit', href: '/services#internal-audit' },
    { label: 'Company Secretary', href: '/services#company-secretary' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Trust & Security', href: '/trust' },
    { label: 'Platform', href: '/platform' },
    { label: 'Resources', href: '/resources' },
    { label: 'Contact', href: '/contact' },
  ],
  jurisdiction: [
    { label: 'Singapore (MAS)', href: '/about#jurisdiction' },
    { label: 'ADGM (FSRA)', href: '/about#jurisdiction' },
    { label: 'Hong Kong (SFC)', href: '/about#jurisdiction' },
    { label: 'United Kingdom (FCA)', href: '/about#jurisdiction' },
    { label: 'DIFC (DFSA)', href: '/about#jurisdiction' },
  ],
} as const;
