import { test } from 'node:test';
import type { Database } from '../../src/lib/backend/database.types.ts';
import type {
  Module,
  Role,
  priorities,
  statuses
} from '../../src/lib/model.ts';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type Enums = Database['public']['Enums'];

// These constraints must compile; executing Node tests alone cannot check parity.
export type DatabaseParity = [
  Assert<Equal<Enums['app_role'], Role>>,
  Assert<Equal<Enums['app_module'], Module>>,
  Assert<Equal<Enums['member_status'], (typeof statuses)['Members'][number]>>,
  Assert<Equal<Enums['program_status'], (typeof statuses)['Programs'][number]>>,
  Assert<Equal<Enums['event_status'], (typeof statuses)['Events'][number]>>,
  Assert<
    Equal<Enums['donation_status'], (typeof statuses)['Donations'][number]>
  >,
  Assert<Equal<Enums['case_status'], (typeof statuses)['Cases'][number]>>,
  Assert<Equal<Enums['case_priority'], (typeof priorities)[number]>>
];

test('database enum parity is enforced by the portal TypeScript check', () => {});
