/** The public design collection. Routes are relative to /design/. */
export const designDocuments = [
  {
    source: 'product-design-spec.md',
    slug: 'product',
    title: 'Product design specification',
    description:
      'Product requirements, workflows and design rules for the community portal.',
    status: 'Specification v1.0',
    archived: false
  },
  {
    source: 'svelte-mapping-components-development-plan.md',
    slug: 'mapping',
    title: 'Mapping development plan',
    description:
      'The current proposal for the unified Svelte mapping components.',
    status: 'Draft for review — v0.3',
    archived: false
  },
  {
    source: 'community-portal-backend-plan.md',
    slug: 'portal-backend',
    title: 'Portal backend plan',
    description:
      'The proposed authentication, persistence and hosting architecture.',
    status: 'Draft for review — v0.3',
    archived: false
  },
  {
    source: 'mapping-components-spec.md',
    slug: 'archive/mapping-spec',
    title: 'Earlier mapping specification',
    description:
      'Historical reference superseded by the mapping development plan.',
    status: 'Superseded — v0.1',
    archived: true
  }
] as const;

export const designSidebar = [
  {
    title: 'Design documents',
    items: [
      { title: 'Overview', to: '/design/' },
      ...designDocuments
        .filter((doc) => !doc.archived)
        .map((doc) => ({
          title: doc.title,
          to: `/design/${doc.slug}/`
        }))
    ]
  },
  {
    title: 'Archive',
    items: designDocuments
      .filter((doc) => doc.archived)
      .map((doc) => ({
        title: doc.title,
        to: `/design/${doc.slug}/`
      }))
  },
  { title: 'Component documentation', to: '/components/' }
];
