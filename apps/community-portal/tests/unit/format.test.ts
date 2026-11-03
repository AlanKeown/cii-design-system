import assert from 'node:assert/strict';
import { test } from 'node:test';
import { date, money, month, today } from '../../src/lib/format.ts';

test('reused formatters preserve Australian display values across repeated calls', () => {
  for (let repeat = 0; repeat < 3; repeat++) {
    assert.equal(money(1234.5), '$1,235');
    assert.equal(money('-12.5'), '-$13');
    assert.equal(money(undefined), '$0');
    assert.equal(date(undefined), '—');
    assert.equal(date('2026-01-01'), '1 Jan 2026');
    assert.equal(date('2026-07-01'), '1 July 2026');
    assert.equal(date('2026-01-01T13:00:00Z'), '2 Jan 2026');
    assert.equal(date('2026-07-01T14:00:00Z'), '2 July 2026');
    assert.equal(month('2026-01-01'), 'Jan');
    assert.equal(month('2026-07-31'), 'Jul');
    assert.throws(() => date('invalid'), RangeError);
  }
});

test('cached day formatter still advances at Sydney midnight in summer and winter', (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-01-01T12:59:00Z')
  });
  assert.equal(today(), '2026-01-01');
  t.mock.timers.tick(60_000);
  assert.equal(today(), '2026-01-02');
  t.mock.timers.setTime(new Date('2026-07-01T13:59:00Z').valueOf());
  assert.equal(today(), '2026-07-01');
  t.mock.timers.tick(60_000);
  assert.equal(today(), '2026-07-02');
});
