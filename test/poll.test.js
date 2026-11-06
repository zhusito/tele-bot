const assert = require('node:assert/strict');
const test = require('node:test');
const { validateQuestion, validateOption } = require('../handlers/poll');

test('validates and trims poll questions and options', () => {
  assert.deepEqual(validateQuestion('  Makan apa?  '), { value: 'Makan apa?' });
  assert.deepEqual(validateOption('  Nasi  ', []), { value: 'Nasi' });
});

test('rejects invalid questions, empty and duplicate options, and more than ten choices', () => {
  assert.match(validateQuestion(' ').error, /1-255 karakter/);
  assert.match(validateQuestion('a'.repeat(256)).error, /1-255 karakter/);
  assert.match(validateOption(' ', []).error, /1-100 karakter/);
  assert.match(validateOption('ya', ['Ya']).error, /duplikat/);
  assert.match(validateOption('pilihan', Array(10).fill('lain')).error, /maksimal/);
});
