export interface NavItem {
  label: string;
  href: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const GUIDES_NAV: NavSection[] = [
  {
    title: 'Start here',
    items: [
      { label: 'Getting started', href: '/guides/getting-started/' },
      { label: 'Configuration', href: '/guides/configuration/' },
    ],
  },
  {
    title: 'Make it yours',
    items: [
      { label: 'Theming by tokens', href: '/guides/theming/' },
      { label: 'Responsive layout', href: '/guides/layout/' },
      { label: 'Introspection & testing', href: '/guides/testing/' },
    ],
  },
];

export const DOCS_NAV: NavSection[] = [
  {
    title: 'API reference',
    items: [
      { label: 'Mount & façade', href: '/docs/openui/' },
      { label: 'Events', href: '/docs/events/' },
    ],
  },
  {
    title: 'Doctrine',
    items: [
      { label: 'The Charter', href: '/charter/' },
    ],
  },
];

export const RECIPES_NAV: NavSection[] = [
  {
    title: 'Recipes',
    items: [
      { label: 'All recipes', href: '/recipes/' },
      { label: 'Swap the spin button', href: '/recipes/swap-spin-button/' },
      { label: 'Re-skin with tokens', href: '/recipes/theme-override/' },
      { label: 'Run an autoplay loop', href: '/recipes/autoplay-loop/' },
      { label: 'Drive it from a server', href: '/recipes/server-driven/' },
      { label: 'Read state in an e2e test', href: '/recipes/e2e-introspection/' },
    ],
  },
];
