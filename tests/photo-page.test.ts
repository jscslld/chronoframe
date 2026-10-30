import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePhotoPage } from '@chronoframe/core'

test('photo page validates bounds and uses a half-open UTC date interval', () => {
  assert.deepEqual(
    parsePhotoPage({
      limit: '20',
      offset: '40',
      from: '2020-01-01',
      before: '2021-01-01',
    }),
    {
      limit: 20,
      offset: 40,
      from: '2020-01-01T00:00:00.000Z',
      before: '2021-01-01T00:00:00.000Z',
    },
  )
  for (const query of [
    { limit: '0' },
    { limit: '101' },
    { offset: '-1' },
    { offset: '1.5' },
    { from: '2023-02-29' },
    { from: ['2020-01-01'] },
    { from: '2021-01-01', before: '2020-01-01' },
  ])
    assert.throws(() => parsePhotoPage(query), RangeError)
})
