import adapter from '@sveltejs/adapter-static';
import { defaultTheme } from '@sveltepress/theme-default';
import { sveltepress } from '@sveltepress/vite';
import { defineConfig } from 'vite';
import { designSidebar } from '../../scripts/design-documents.ts';
import {
  labelDesignHeadings,
  protectDesignExamples,
  syncDesignDocs
} from '../../scripts/sync-design-docs.ts';

const sidebar = [
  {
    title: 'Start here',
    items: [
      { title: 'Introduction', to: '/' },
      { title: 'Get started', to: '/getting-started/' }
    ]
  },
  {
    title: 'Foundations',
    items: [
      { title: 'Design tokens', to: '/foundations/tokens/' },
      { title: 'Responsive layout', to: '/foundations/responsive-layout/' },
      { title: 'Iconography', to: '/foundations/iconography/' }
    ]
  },
  {
    title: 'Components',
    items: [
      { title: 'Overview', to: '/components/' },
      { title: 'Map', to: '/components/map/' },
      { title: 'App shell', to: '/components/app-shell/' },
      { title: 'Button', to: '/components/button/' },
      { title: 'Icon button', to: '/components/icon-button/' },
      { title: 'Avatar', to: '/components/avatar/' },
      { title: 'Badge and indicator', to: '/components/badge/' },
      { title: 'Text field', to: '/components/text-field/' },
      { title: 'Textarea', to: '/components/textarea/' },
      { title: 'Select', to: '/components/select/' },
      { title: 'Multiselect', to: '/components/multiselect/' },
      { title: 'Date input', to: '/components/date-input/' },
      { title: 'Number and currency input', to: '/components/number-input/' },
      { title: 'Checkbox', to: '/components/checkbox/' },
      { title: 'Radio group', to: '/components/radio-group/' },
      { title: 'Toggle', to: '/components/toggle/' },
      { title: 'Search and filter bar', to: '/components/search-filter-bar/' },
      { title: 'Data table', to: '/components/data-table/' },
      { title: 'Status chip', to: '/components/status-chip/' },
      { title: 'Tag', to: '/components/tag/' },
      { title: 'Card', to: '/components/card/' },
      { title: 'Tabs', to: '/components/tabs/' },
      { title: 'Modal', to: '/components/modal/' },
      { title: 'Drawer', to: '/components/drawer/' },
      { title: 'Disclosure and popover', to: '/components/disclosure/' },
      { title: 'Toast', to: '/components/toast/' },
      { title: 'Alert', to: '/components/alert/' },
      { title: 'Banner', to: '/components/banner/' },
      { title: 'Empty state', to: '/components/empty-state/' },
      { title: 'Activity timeline', to: '/components/activity-timeline/' },
      { title: 'Pagination', to: '/components/pagination/' },
      { title: 'Breadcrumbs', to: '/components/breadcrumbs/' },
      { title: 'Command menu', to: '/components/command-menu/' }
    ]
  },
  {
    title: 'Patterns',
    items: [
      { title: 'Overview', to: '/patterns/' },
      { title: 'Page heading', to: '/patterns/page-heading/' },
      { title: 'Dashboard', to: '/patterns/dashboard/' },
      { title: 'Record forms', to: '/patterns/record-forms/' },
      { title: 'Record detail', to: '/patterns/record-detail/' },
      { title: 'Reporting and date ranges', to: '/patterns/reporting/' },
      { title: 'Bulk actions and export', to: '/patterns/bulk-actions/' },
      {
        title: 'Permissions and workspace context',
        to: '/patterns/permissions/'
      }
    ]
  },
  {
    title: 'Project',
    items: [
      { title: 'Community portal', to: '/examples/community-portal/' },
      { title: 'Design documents', to: '/design/' },
      { title: 'Migration notes', to: '/migration/' }
    ]
  }
];

export default defineConfig({
  plugins: [
    {
      name: 'design-document-watch',
      configureServer(server) {
        const sources = new URL('../../docs/', import.meta.url).pathname;
        server.watcher.add(sources);
        server.watcher.on('change', (filename) => {
          if (filename.startsWith(sources)) {
            void syncDesignDocs().catch((error: unknown) =>
              server.config.logger.error(String(error))
            );
          }
        });
      }
    },
    sveltepress({
      remarkPlugins: (plugins) => [
        protectDesignExamples,
        ...plugins,
        labelDesignHeadings
      ],
      siteConfig: {
        title: 'CII Design System',
        description:
          'Accessible Svelte components and patterns for community services.'
      },
      svelteKitOptions: {
        adapter: adapter(),
        paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
      },
      theme: defaultTheme({
        highlighter: {
          languages: [
            'svelte',
            'sh',
            'js',
            'html',
            'ts',
            'md',
            'css',
            'scss',
            'sql',
            'json',
            'jsonc',
            'mermaid',
            'yaml'
          ]
        },
        logo: '/logo.svg',
        navbar: [
          { title: 'Get started', to: '/getting-started/' },
          { title: 'Components', to: '/components/' },
          { title: 'Patterns', to: '/patterns/' },
          { title: 'Design documents', to: '/design/' },
          { title: 'Live portal', to: 'https://cii-community-portal.pages.dev' }
        ],
        sidebar: { '/design/': designSidebar, '/': sidebar },
        themeColor: {
          light: '#F5F7FB',
          dark: '#0A121C',
          primary: '#7955BD',
          primaryDeep: '#58358C',
          hover: '#6A46AC',
          gradient: { start: '#122B4D', end: '#7955BD' }
        }
      })
    })
  ]
});
