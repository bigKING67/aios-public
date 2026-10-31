export const CHART_SERIES_COLORS = {
  series1: '#6E56CF',
  series2: '#0E9C8E',
  series3: '#C76E12',
  series4: '#2F6FE0',
  series5: '#C2417A',
  series6: '#A8A8A8',
  muted: '#A8A8A8',
  highlight: '#6E56CF',
} as const;

export const DOMAIN_TAXONOMY_COLORS = {
  traffic: {
    summary: { accent: '#8A8A8A', text: '#505050', bg: '#F3F3F3', border: '#B0B0B0' },
    l1: { accent: '#1854BC', text: '#17489F', bg: '#F4F7FC', border: '#ADCAFB' },
    l2: { accent: '#2F6FE0', text: '#235ABC', bg: '#F4F7FC', border: '#C5DAFE' },
    l3: { accent: '#81ABF3', text: '#3766B8', bg: '#F4F7FC', border: '#DBE7FC' },
  },
  topsis: {
    star: {
      text: '#BF3D2F',
      bg: '#FFF1EF',
      border: '#F2C4C0',
      shadow: 'rgba(191, 61, 47, 0.24)',
      area: 'rgba(191, 61, 47, 0.08)',
    },
    stable: {
      text: '#235ABC',
      bg: '#F4F7FC',
      border: '#C5DAFE',
      shadow: 'rgba(47, 111, 224, 0.28)',
      area: 'rgba(47, 111, 224, 0.08)',
    },
    opportunity: {
      text: '#9B4595',
      bg: '#FCF3FA',
      border: '#E5C6E1',
      shadow: 'rgba(155, 69, 149, 0.22)',
      area: 'rgba(155, 69, 149, 0.05)',
    },
    longTail: {
      text: '#2F8C5B',
      bg: '#ECF8F1',
      border: '#BFE8CA',
      shadow: 'rgba(47, 140, 91, 0.22)',
      area: 'rgba(47, 140, 91, 0.06)',
    },
    neutral: { text: '#8A8A8A', bg: '#F8F8F8', border: '#E3E3E3' },
  },
  funnel: {
    track: { color: '#C5DAFE', bg: '#F4F7FC', textOnFill: '#1F1F1F' },
    exposure: { color: '#98BBF8', bg: '#F4F7FC', textOnFill: '#1F1F1F' },
    visit: { color: '#6397F1', bg: '#EAF1FC', textOnFill: '#1F1F1F' },
    intent: { color: '#2F6FE0', bg: '#EAF1FC', textOnFill: '#FFFFFF' },
    conversion: { color: '#1854BC', bg: '#F4F7FC', textOnFill: '#FFFFFF' },
    connector: { color: '#E3E3E3', bg: 'transparent', textOnFill: '#1F1F1F' },
  },
  creator: {
    s: { from: '#17489F', to: '#1854BC', bg: '#DBE7FC', text: '#17489F' },
    a: { from: '#1854BC', to: '#2F6FE0', bg: '#DBE7FC', text: '#1854BC' },
    b: { from: '#2F6FE0', to: '#6397F1', bg: '#EAF1FC', text: '#235ABC' },
    c: { from: '#6397F1', to: '#ADCAFB', bg: '#EAF1FC', text: '#3766B8' },
    d: { from: '#ADCAFB', to: '#DBE7FC', bg: '#F3F3F3', text: '#666666' },
  },
  cooperation: {
    unclassified: { text: '#666666', bg: '#F3F3F3' },
    initialContact: { text: '#235ABC', bg: '#DBE7FC' },
    sampleNegotiation: { text: '#8F5E02', bg: '#FFF0C7' },
    notConsidering: { text: '#A65F3E', bg: '#FFE4DD' },
    paused: { text: '#9F3D35', bg: '#FFE1DE' },
    liveStarted: { text: '#0F6F2E', bg: '#DFF5E7' },
  },
} as const;

export type ChartSeriesColorKey = keyof typeof CHART_SERIES_COLORS;
export type DomainTaxonomyColors = typeof DOMAIN_TAXONOMY_COLORS;
export type TrafficTaxonomyKey = keyof DomainTaxonomyColors['traffic'];
export type TopsisTaxonomyKey = keyof DomainTaxonomyColors['topsis'];
export type FunnelTaxonomyKey = keyof DomainTaxonomyColors['funnel'];
export type CreatorTaxonomyKey = keyof DomainTaxonomyColors['creator'];
export type CooperationTaxonomyKey = keyof DomainTaxonomyColors['cooperation'];
