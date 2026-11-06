const assert = require('node:assert/strict');
const test = require('node:test');
const { isAfterMonthlySendTime, monthKey, monthRange } = require('../services/recap');

test('monthly recap uses Jakarta local month boundaries', () => {
  assert.equal(monthKey(new Date('2026-01-31T16:59:00Z')), '2026-01');
  assert.equal(monthKey(new Date('2026-01-31T17:00:00Z')), '2026-02');
  assert.deepEqual(monthRange('2026-02'), {
    start: Date.parse('2026-01-31T17:00:00Z'),
    end: Date.parse('2026-02-28T17:00:00Z'),
  });
});

test('automatic recap is due from the tenth at 19:00 Jakarta time', () => {
  assert.equal(isAfterMonthlySendTime(new Date('2026-06-10T11:59:00Z')), false);
  assert.equal(isAfterMonthlySendTime(new Date('2026-06-10T12:00:00Z')), true);
  assert.equal(isAfterMonthlySendTime(new Date('2026-06-09T12:00:00Z')), false);
});
