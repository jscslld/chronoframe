import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

test('saved locations start empty and deleting a bookmark preserves photo coordinates', () => {
  const db = new Database(':memory:')
  try {
    migrate(drizzle(db), { migrationsFolder: './packages/database/migrations' })
    db.prepare(
      "insert into photos(id,latitude,longitude) values('photo',32,118)",
    ).run()
    assert.equal(
      db.prepare('select count(*) n from saved_photo_locations').get().n,
      0,
    )
    const row = db
      .prepare(
        'insert into saved_photo_locations(site_id,label,latitude,longitude,created_at) values(1,?,?,?,1) returning id',
      )
      .get('我的位置', 32, 118)
    assert.throws(() =>
      db
        .prepare(
          'insert into saved_photo_locations(site_id,label,latitude,longitude,created_at) values(1,?,?,?,1)',
        )
        .run('我的位置', 31, 119),
    )
    db.prepare(
      'delete from saved_photo_locations where site_id=1 and id=?',
    ).run(row.id)
    assert.equal(
      db.prepare('select count(*) n from saved_photo_locations').get().n,
      0,
    )
    assert.deepEqual(
      db
        .prepare("select latitude,longitude from photos where id='photo'")
        .get(),
      { latitude: 32, longitude: 118 },
    )
  } finally {
    db.close()
  }
})
