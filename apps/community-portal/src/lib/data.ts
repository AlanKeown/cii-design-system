export const modules = [
  'Dashboard',
  'Members',
  'Programs',
  'Events',
  'Donations',
  'Cases',
  'Reports',
  'Administration'
] as const;

import type { Module, Role, PortalRecords } from './model.ts';
export * from './model.ts';

export const permissions: Record<Role, Module[]> = {
  Admin: [...modules],
  Staff: modules.filter((m) => m !== 'Administration'),
  'Volunteer Coordinator': [
    'Dashboard',
    'Members',
    'Programs',
    'Events',
    'Reports'
  ],
  'Donations Manager': ['Dashboard', 'Members', 'Donations', 'Reports'],
  'Case Worker': ['Dashboard', 'Members', 'Programs', 'Cases', 'Reports'],
  'Board Member': ['Dashboard', 'Reports']
};
export const singular: Partial<Record<Module, string>> = {
  Members: 'member',
  Programs: 'program',
  Events: 'event',
  Donations: 'donation',
  Cases: 'case',
  Administration: 'user'
};
export const initialRecords: PortalRecords = {
  Members: [
    {
      kind: 'Members',
      id: 'M-1001',
      name: 'Amelia Thompson',
      email: 'amelia@example.org',
      phone: '0400 123 456',
      status: 'Active',
      type: 'Community member',
      location: 'Parramatta',
      tags: 'Family support',
      date: '2026-10-23',
      notes: 'Prefers contact by email.'
    },
    {
      kind: 'Members',
      id: 'M-1002',
      name: 'Noah Williams',
      email: 'noah@example.org',
      status: 'Active',
      type: 'Volunteer',
      location: 'Sydney',
      tags: 'Events',
      date: '2026-10-22'
    },
    {
      kind: 'Members',
      id: 'M-1003',
      name: 'Olivia Chen',
      email: 'olivia@example.org',
      status: 'Pending',
      type: 'Community member',
      location: 'Blacktown',
      tags: 'New member',
      date: '2026-10-21'
    },
    {
      kind: 'Members',
      id: 'M-1004',
      name: 'Jack Wilson',
      email: 'jack@example.org',
      status: 'Active',
      type: 'Donor',
      location: 'Penrith',
      tags: 'Regular giving',
      date: '2026-10-20'
    },
    {
      kind: 'Members',
      id: 'M-1005',
      name: 'Isla Martin',
      email: 'isla@example.org',
      status: 'Inactive',
      type: 'Community member',
      location: 'Sydney',
      tags: 'Wellbeing',
      date: '2026-10-19'
    },
    {
      kind: 'Members',
      id: 'M-1006',
      name: 'Leo Patel',
      email: 'leo@example.org',
      status: 'Active',
      type: 'Volunteer',
      location: 'Parramatta',
      tags: 'Food relief',
      date: '2026-10-18'
    }
  ],
  Programs: [
    {
      kind: 'Programs',
      id: 'P-101',
      name: 'Community pantry',
      status: 'Active',
      type: 'Food relief',
      location: 'Parramatta hub',
      capacity: 40,
      participants: 28,
      date: '2026-10-27'
    },
    {
      kind: 'Programs',
      id: 'P-102',
      name: 'Together & thriving',
      status: 'Active',
      type: 'Wellbeing',
      location: 'Sydney centre',
      capacity: 24,
      participants: 18,
      date: '2026-10-29'
    },
    {
      kind: 'Programs',
      id: 'P-103',
      name: 'Pathways to work',
      status: 'Pending',
      type: 'Employment',
      location: 'Blacktown hub',
      capacity: 20,
      participants: 12,
      date: '2026-11-02'
    }
  ],
  Events: [
    {
      kind: 'Events',
      id: 'E-201',
      name: 'Neighbourhood lunch',
      status: 'Upcoming',
      type: 'Community',
      location: 'Parramatta hub',
      date: '2026-10-28',
      attendees: 34
    },
    {
      kind: 'Events',
      id: 'E-202',
      name: 'Volunteer welcome session',
      status: 'Upcoming',
      type: 'Volunteers',
      location: 'Sydney centre',
      date: '2026-10-30',
      attendees: 12
    },
    {
      kind: 'Events',
      id: 'E-203',
      name: 'Spring giving celebration',
      status: 'Upcoming',
      type: 'Fundraising',
      location: 'Riverside gardens',
      date: '2026-11-05',
      attendees: 56
    }
  ],
  Donations: [
    {
      kind: 'Donations',
      id: 'D-301',
      name: 'Jack Wilson',
      status: 'Acknowledged',
      type: 'Monthly giving',
      amount: 150,
      location: 'Spring appeal',
      date: '2026-10-25'
    },
    {
      kind: 'Donations',
      id: 'D-302',
      name: 'Riverside Collective',
      status: 'Needs receipt',
      type: 'One-off',
      amount: 2500,
      location: 'Community pantry',
      date: '2026-10-24'
    },
    {
      kind: 'Donations',
      id: 'D-303',
      name: 'Grace Taylor',
      status: 'Acknowledged',
      type: 'One-off',
      amount: 75,
      location: 'Spring appeal',
      date: '2026-10-23'
    }
  ],
  Cases: [
    {
      kind: 'Cases',
      id: 'C-401',
      name: 'Housing referral follow-up',
      status: 'Open',
      priority: 'High',
      type: 'Housing',
      location: 'Sarah Mitchell',
      date: '2026-10-25',
      memberId: 'M-1001'
    },
    {
      kind: 'Cases',
      id: 'C-402',
      name: 'Emergency food assistance',
      status: 'In progress',
      priority: 'High',
      type: 'Food relief',
      location: 'Alex Morgan',
      date: '2026-10-27',
      memberId: 'M-1003'
    },
    {
      kind: 'Cases',
      id: 'C-403',
      name: 'Transport support request',
      status: 'Open',
      priority: 'Normal',
      type: 'Transport',
      location: 'Sarah Mitchell',
      date: '2026-10-29',
      memberId: 'M-1005'
    }
  ],
  Administration: [
    {
      kind: 'Administration',
      id: 'U-01',
      name: 'Sarah Mitchell',
      email: 'sarah@example.org',
      status: 'Active',
      type: 'Admin',
      location: 'All locations',
      date: '2026-10-26'
    },
    {
      kind: 'Administration',
      id: 'U-02',
      name: 'Alex Morgan',
      email: 'alex@example.org',
      status: 'Active',
      type: 'Case Worker',
      location: 'Parramatta',
      date: '2026-10-24'
    }
  ]
};
