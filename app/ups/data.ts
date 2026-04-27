// Static content for the UPS partnership-priorities page.
// Order = priority ranking (top to bottom).

export type Tier = 'urgent' | 'tier-1' | 'tier-2' | 'tier-3'

export type AskItem = {
  id: string
  rank: number
  tier: Tier
  title: string
  description: string
  why: string
  impact: string
  impactSub: string
  badge?: { label: string; kind: 'likely' | 'medium' | 'stretch' | 'escalate' }
  alarm?: boolean
  redAccent?: boolean
}

export const ITEMS: AskItem[] = [
  {
    id: 'dca-codes',
    rank: 1,
    tier: 'urgent',
    redAccent: true,
    alarm: true,
    title: 'Digital Connections approval codes — expires in 5 days',
    description:
      "I have signed Digital Connections funding contracts for accounts E32G88 and F835B6 at $24,500 each — but I can't access the approval codes. The system says they expire in 5 days. Need access ASAP to redeem before forfeit. Can you confirm the approval codes and the redemption process?",
    why: 'Hard 5-day deadline. If we don\'t get the approval codes, we forfeit $48,900 in subsidies that are already contractually ours. No other ask is time-bounded like this.',
    impact: '$48,900',
    impactSub: 'FORFEIT in 5 days',
  },
  {
    id: 'bulk-claim-path',
    rank: 2,
    tier: 'urgent',
    title: 'Bulk submission path for our 1,500+ lost-package $100 claims',
    description:
      'We have 1,500+ lost-package cases across the last 12 months ready to file at the default $100 declared value. Is there a bulk-submission API or a named billing contact who can batch them? One-by-one filing through the standard portal would take weeks.',
    why: '~$150K of credits already contractually ours, just needs a path to recover. Pure operational unblock — no negotiation needed. Should be a same-week answer.',
    impact: '$150K+',
    impactSub: 'credits to recover',
    badge: { label: 'Operational', kind: 'likely' },
  },
  {
    id: 'late-nda-refund',
    rank: 3,
    tier: 'urgent',
    title: 'Process for filing late-NDA refund claims',
    description:
      "We have packages we paid for via Next Day Air that delivered in 2 days. What's the process to claim a service-level refund? Is GSR active on our F835B6 NDA service today, and what's the filing window?",
    why: "Operational unblock. We've been eating these losses because we don't know the path. Once we have it we can backfile and recover.",
    impact: 'guidance',
    impactSub: 'needed',
    badge: { label: 'Operational', kind: 'likely' },
  },
  {
    id: 'scc-discount-bump',
    rank: 4,
    tier: 'tier-1',
    title: 'Improve SCC100/SCC200 (dim correction) discount: 55% → 70%',
    description:
      'This single adjustment category is $311K of our $343K total surcharge spend in trailing 12 months. We currently see ~55% off published rates. A tighter discount here would dramatically improve our blended shipping economics.',
    why: "We're committing real engineering investment to better dimension validation at the source. Pricing reflects partnership — you'll see fewer absolute corrections going forward, and we'll keep more of the volume on UPS instead of leaking to regional carriers. Locks our economics through 2028.",
    impact: '$70–100K',
    impactSub: '/yr opportunity',
    badge: { label: 'Pricing escalation', kind: 'escalate' },
  },
  {
    id: 'cubic-threshold-ground',
    rank: 5,
    tier: 'tier-1',
    title: 'Cubic-volume threshold exemption on Ground (sub-1,728 cu in)',
    description:
      'Extend the same cubic-threshold exemption that\'s already in our F835B6 contract for Ground Saver to UPS Ground service: packages with cubic volume ≤1,728 cu in billed by actual weight only, no dimensional weight calculation. Most of our merchant packages (sneakers, streetwear) are 500–1,200 cu in.',
    why: "The pattern already exists in our agreement — we're asking for internal alignment, not a new pricing concept. Eliminates the dim-weight friction on small boxes. Reduces dispute volume on your side.",
    impact: '$30–60K',
    impactSub: '/yr',
    badge: { label: 'Pricing escalation', kind: 'escalate' },
  },
  {
    id: 'c4a818-failover',
    rank: 6,
    tier: 'tier-1',
    title: 'C4A818 fail-over rebill clause',
    description:
      "Add to Addendum A of the C4A818 Sire 2-Day Carrier Agreement: if a shipment's UPS-audited dimensions or weight exceed C4A818 thresholds (≤10 lbs, ≤650 cu in), the shipment is automatically rebilled at our F835B6 carrier agreement rates for the equivalent service level — in lieu of the $50 oversize fee + published rate calculation.",
    why: 'Not a new discount — just a billing fail-over to a contract you\'ve already approved (F835B6). Solves the "merchant misenters dimensions" problem cleanly. UPS keeps all the revenue F835B6 would have generated; we lose only the $50 penalty fee. No new pricing analysis needed.',
    impact: 'protects',
    impactSub: 'worst-case overcharges',
    badge: { label: 'Likely yes', kind: 'likely' },
  },
  {
    id: 'dim-cap-50',
    rank: 7,
    tier: 'tier-1',
    title: 'Cap on dim-correction surcharge — 50% of base rate',
    description:
      'For any shipment where UPS-audited dimensions/weight result in additional charges, the maximum correction surcharge billed cannot exceed 50% of the original Net Transportation Charge for that shipment.',
    why: "Caps unpredictability for our forecasting. UPS isn't losing margin you'd otherwise keep — most of these get disputed anyway. Saves both teams the dispute cycle on outlier cases.",
    impact: '$30–50K',
    impactSub: '/yr',
    badge: { label: 'Defensive', kind: 'medium' },
  },
  {
    id: 'audit-tolerance-10',
    rank: 8,
    tier: 'tier-1',
    title: '10% audit tolerance band',
    description:
      'If entered dimensions/weight are within 10% of UPS-audited measurement, no correction surcharge. Beyond 10%, normal correction billing applies.',
    why: "Industry-standard for shippers at our spend tier. Reduces friction and disputes on the close-call corrections. We'll trust UPS more on the corrections that DO bill, leading to fewer disputes.",
    impact: '$25–40K',
    impactSub: '/yr',
    badge: { label: 'Pricing escalation', kind: 'escalate' },
  },
  {
    id: '3pl-rate-chart',
    rank: 9,
    tier: 'tier-1',
    title: 'Rate chart for the UPS 3PL / Master Shipper program',
    description:
      "Sire is a multi-merchant shipping platform with 400+ active merchants printing labels through us. We'd like to be evaluated under UPS's 3PL/aggregator program template — different pricing tables that often beat direct-shipper structures. Could you share the program rate chart and eligibility criteria?",
    why: 'We may be on the wrong contract template entirely. Sire IS a multi-merchant aggregator — fits the 3PL profile perfectly. Worth a structural review now while we have momentum on amendments.',
    impact: 'structural',
    impactSub: 're-evaluation',
    badge: { label: 'Exploratory', kind: 'medium' },
  },
  {
    id: 'declared-value-200',
    rank: 10,
    tier: 'tier-2',
    title: 'Free declared value bumped from $100 → $200/pkg',
    description:
      'We have 1,500+ lost-package cases on file in trailing 12 months. Doubling default coverage helps us serve our merchants without adding insurance line items.',
    why: 'Standard sweetener at our spend level. Strengthens our offering to merchants — keeps them using UPS labels rather than self-insuring elsewhere.',
    impact: '$150K',
    impactSub: 'coverage upside',
    badge: { label: 'Standard ask', kind: 'likely' },
  },
  {
    id: 'zone-458-extra',
    rank: 11,
    tier: 'tier-2',
    title: 'Extra 10% off Zones 4, 5, 8 specifically',
    description:
      "About 60% of our cost lives in Zones 4, 5, and 8: Zone 8 alone is 5,456 ships/yr at $227K total exposure. Zones 5 and 4 add another $257K combined. Targeted concession reflecting our destination concentration.",
    why: 'Helps you protect volume from regional-carrier competition (OnTrac in CA, LSO in TX, etc) on the long-haul lanes where UPS faces the most pressure. Zones 4/5/8 are concentrated lanes where we\'d be most tempted to test alternatives.',
    impact: '$24–48K',
    impactSub: '/yr',
    badge: { label: 'Pricing', kind: 'escalate' },
  },
  {
    id: 'ground-2030-band',
    rank: 12,
    tier: 'tier-2',
    title: '20–30 lb Ground discount band: 44% → 50% off',
    description:
      'Our heaviest-volume weight band — about 30K packages/yr land in this 20–30 lb tier. Currently 44% off published per the F835B6 service incentives table; asking for 50%.',
    why: 'This is our highest-volume weight band by far. Tier-band improvement reflects our actual volume composition. Modest 6 pp improvement matches our growth trajectory.',
    impact: '$15–30K',
    impactSub: '/yr',
    badge: { label: 'Pricing', kind: 'escalate' },
  },
  {
    id: 'lane-addendum',
    rank: 13,
    tier: 'tier-2',
    title: 'Lane-discount addendum — 5 lanes >1,000 ships/yr',
    description:
      'Combined ~12,300 ships/yr at $185K base across our 5 highest-volume lanes:\n• CA → CA (4,015 ships): extra 20%\n• FL → FL (2,592 ships): extra 20%\n• CA → NJ (2,476 ships): extra 12%\n• IL → IL (1,841 ships): extra 20%\n• NV → CA (1,357 ships): extra 15%',
    why: 'Intra-state lanes (CA→CA, FL→FL, IL→IL) run on dense urban networks where UPS has overcapacity — basically marginal-cost delivery. Custom lane rates lock our routing decisions and prevent us migrating to regional carriers. CA→NJ at 2,476 ships is mature enough to justify a transcontinental lane rate.',
    impact: '$15–25K',
    impactSub: '/yr',
    badge: { label: 'Pricing', kind: 'escalate' },
  },
  {
    id: 'mpc-reduction',
    rank: 14,
    tier: 'tier-2',
    title: 'MPC reduction $11.99 → $8.75 on F835B6 Ground',
    description:
      'We have 4,000+ packages/yr in the 1–2 lb band where the Min Package Charge eats into our discount. Reducing MPC keeps the contract discount meaningful on our lightweight tail.',
    why: 'Standard for shippers at our volume tier. The current MPC effectively neutralizes the discount on our lightest packages — making Ground Saver / USPS look more attractive for those. Lowering MPC keeps light volume on Ground.',
    impact: '$10–15K',
    impactSub: '/yr',
    badge: { label: 'Pricing', kind: 'escalate' },
  },
  {
    id: 'gsr-ground',
    rank: 15,
    tier: 'tier-3',
    title: 'Reinstate Service Guarantee (GSR) on Ground for F835B6',
    description:
      'We know GSR has been suspended industry-wide post-COVID, but UPS has been reinstating for select larger accounts as a contract sweetener. Even partial reinstatement on commit times for Ground would be real recovery for us.',
    why: "We're hitting the F835B6 DCA revenue commitment well — this is an \"earned partnership perk.\" Lets us confidently commit on delivery dates to merchants, which keeps them using UPS.",
    impact: 'variable',
    impactSub: 'recovery',
    badge: { label: 'Escalate', kind: 'escalate' },
  },
  {
    id: 'address-correction',
    rank: 16,
    tier: 'tier-3',
    title: 'Address correction reduction $13.40 → $5/correction',
    description:
      'About 400 events/yr at $13.40 each. Reducing the per-correction fee aligns it with our actual address-quality investment on our side.',
    why: "We're improving address validation at label creation; the current $13.40 fee is misaligned with our address-data quality work. Lower fee + better data on our side = win-win.",
    impact: '$3–5K',
    impactSub: '/yr',
    badge: { label: 'Standard', kind: 'likely' },
  },
  {
    id: 'eft-claims',
    rank: 17,
    tier: 'tier-3',
    title: 'Enable EFT for UPS claim submissions',
    description:
      "Operational ask — we'd like Electronic Funds Transfer for claim refund payouts (in lieu of paper checks). Speeds up turnaround for both sides.",
    why: 'Pure operational improvement. Reduces paper-check overhead on UPS side and accelerates our reconciliation cycle.',
    impact: 'operational',
    impactSub: 'faster cycles',
    badge: { label: 'Quick yes', kind: 'likely' },
  },
]
