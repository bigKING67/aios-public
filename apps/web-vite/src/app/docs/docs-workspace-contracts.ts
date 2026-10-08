export interface NavItem {
  href: string;
  label: string;
}

export type DocsPageKey = 'home' | 'guide' | 'analysis-frameworks' | 'analysis-plans' | 'references';

export interface DocsPageLink {
  key: DocsPageKey;
  href: string;
  label: string;
  helper: string;
  /** Sub-pages listed under this section in the sidebar while it is active. */
  children?: NavItem[];
}

export interface DocsRow {
  label: string;
  value: string;
}

export interface DocsCard {
  title: string;
  desc: string;
  href?: string;
  action?: string;
  meta?: string;
  tags?: string[];
  details?: DocsRow[];
}

export interface DocsStep {
  title: string;
  desc: string;
}

export interface DocsTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

/** A screenshot or diagram served from `public/`; `src` is an absolute site path. */
export interface DocsFigure {
  src: string;
  alt: string;
  caption?: string;
}

/** A walkthrough video served from `public/`; captions are burned into the picture. */
export interface DocsVideo {
  src: string;
  poster: string;
  title: string;
  caption?: string;
}

export interface DocsSection {
  id: string;
  title: string;
  lead?: string;
  paragraphs?: string[];
  cards?: DocsCard[];
  steps?: DocsStep[];
  rows?: DocsRow[];
  tables?: DocsTable[];
  figures?: DocsFigure[];
  video?: DocsVideo;
}

export interface DocsPageModel {
  key: DocsPageKey;
  path: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryAction?: {
    href: string;
    label: string;
  };
  sections: DocsSection[];
}

export interface DocsWorkspaceSnapshot {
  version: 1;
  pageLinks: DocsPageLink[];
  pages: Record<DocsPageKey, DocsPageModel>;
  detailPages: Record<string, DocsPageModel>;
}
