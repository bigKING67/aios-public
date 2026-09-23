export const CHART_SERIES_COLORS = {
  series1: '#445DF6',
  series2: '#75B1F8',
  series3: '#3264F6',
  series4: '#4F8CB5',
  series5: '#536F86',
  series6: '#A4772A',
  muted: '#8A8F8A',
  highlight: '#3264F6',
} as const;

export const DOMAIN_TAXONOMY_COLORS = {
  traffic: {
    summary: { accent: '#8795AA', text: '#3F5067', bg: '#F1F5FB', border: '#A6B4C7' },
    l1: { accent: '#445DF6', text: '#243CB5', bg: '#F2F5FF', border: '#B8C4FF' },
    l2: { accent: '#2F6EEA', text: '#2457C5', bg: '#F2F6FF', border: '#C9D8FF' },
    l3: { accent: '#75B1F8', text: '#2F6EA8', bg: '#F4FAFF', border: '#CDE6FE' },
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
      text: '#2457C5',
      bg: '#F2F6FF',
      border: '#C9D8FF',
      shadow: 'rgba(47, 110, 234, 0.28)',
      area: 'rgba(47, 110, 234, 0.08)',
    },
    opportunity: {
      text: '#2F6F9F',
      bg: '#EAF3FA',
      border: '#BFD5E5',
      shadow: 'rgba(47, 111, 159, 0.22)',
      area: 'rgba(47, 111, 159, 0.05)',
    },
    longTail: {
      text: '#2F8C5B',
      bg: '#ECF8F1',
      border: '#BFE8CA',
      shadow: 'rgba(47, 140, 91, 0.22)',
      area: 'rgba(47, 140, 91, 0.06)',
    },
    neutral: { text: '#8A8F8A', bg: '#FAFAFA', border: '#E6E6E6' },
  },
  funnel: {
    track: { color: '#C9D8FF', bg: '#F2F6FF', textOnFill: '#1A1A1A' },
    exposure: { color: '#7EA1F7', bg: '#F2F6FF', textOnFill: '#FFFFFF' },
    visit: { color: '#5D86F1', bg: '#EFF4FF', textOnFill: '#FFFFFF' },
    intent: { color: '#4476ED', bg: '#E8F0FF', textOnFill: '#FFFFFF' },
    conversion: { color: '#2F6EEA', bg: '#F5F8FF', textOnFill: '#FFFFFF' },
    connector: { color: '#D7DEE0', bg: 'transparent', textOnFill: '#1A1A1A' },
  },
  creator: {
    s: { from: '#1F4FBF', to: '#445DF6', bg: '#D6E0FF', text: '#1F4FBF' },
    a: { from: '#3264F6', to: '#5D86F1', bg: '#DDE7FF', text: '#243CB5' },
    b: { from: '#2F6EEA', to: '#75B1F8', bg: '#E5EEFF', text: '#2457C5' },
    c: { from: '#75B1F8', to: '#CDE6FE', bg: '#EAF7FF', text: '#2F6EA8' },
    d: { from: '#C9D8FF', to: '#F2F6FF', bg: '#F0F5FF', text: '#536F86' },
  },
  cooperation: {
    unclassified: { text: '#5F6368', bg: '#EFEFEF' },
    initialContact: { text: '#2457C5', bg: '#E4ECFF' },
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
