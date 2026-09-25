import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadConceptNote,
  saveConceptNote,
  USER_NOTE_CONFLICT_COLUMNS,
} from '../lib/concept-notes.ts';

function notesDatabase(authenticatedUserId) {
  const rows = [];
  let sequence = 0;

  return {
    rows,
    from(table) {
      assert.equal(table, 'user_notes');

      return {
        select() {
          const filters = new Map();
          const query = {
            eq(column, value) {
              filters.set(column, value);
              return query;
            },
            async maybeSingle() {
              const row = rows.find(
                (candidate) =>
                  candidate.user_id === authenticatedUserId &&
                  [...filters].every(
                    ([column, value]) => candidate[column] === value
                  )
              );
              return {
                data: row ? { note: row.note } : null,
                error: null,
              };
            },
          };
          return query;
        },
        async upsert(payload, options) {
          if (payload.user_id !== authenticatedUserId) {
            return {
              data: null,
              error: {
                code: '42501',
                message: 'new row violates row-level security policy',
              },
            };
          }

          assert.deepEqual(options, {
            onConflict: USER_NOTE_CONFLICT_COLUMNS,
          });

          const existing = rows.find(
            (candidate) =>
              candidate.user_id === payload.user_id &&
              candidate.concept_id === payload.concept_id
          );

          if (existing) {
            existing.note = payload.note;
            existing.updated_at = payload.updated_at;
          } else {
            sequence += 1;
            rows.push({ id: `note-${sequence}`, ...payload });
          }

          return { data: null, error: null };
        },
      };
    },
  };
}

const ownerId = 'owner-a';
const conceptId = 'concept-a';

test('first save creates one owner-scoped Concept Note', async () => {
  const database = notesDatabase(ownerId);

  const { error } = await saveConceptNote(database, {
    userId: ownerId,
    conceptId,
    note: 'Note text A',
  });

  assert.equal(error, null);
  assert.equal(database.rows.length, 1);
  assert.equal(database.rows[0].note, 'Note text A');
});

test('second and repeated saves update the same logical Note and stable row identity', async () => {
  const database = notesDatabase(ownerId);
  await saveConceptNote(database, { userId: ownerId, conceptId, note: 'A' });
  const originalId = database.rows[0].id;

  await saveConceptNote(database, { userId: ownerId, conceptId, note: 'B' });
  await saveConceptNote(database, { userId: ownerId, conceptId, note: 'B' });

  assert.equal(database.rows.length, 1);
  assert.equal(database.rows[0].id, originalId);
  assert.equal(database.rows[0].note, 'B');
});

test('reload reads the saved Note and a later save still updates it', async () => {
  const database = notesDatabase(ownerId);
  await saveConceptNote(database, { userId: ownerId, conceptId, note: 'A' });

  assert.deepEqual(await loadConceptNote(database, ownerId, conceptId), {
    data: { note: 'A' },
    error: null,
  });

  await saveConceptNote(database, { userId: ownerId, conceptId, note: 'B' });
  assert.deepEqual(await loadConceptNote(database, ownerId, conceptId), {
    data: { note: 'B' },
    error: null,
  });
  assert.equal(database.rows.length, 1);
});

test('rapid sequential saves preserve the composite uniqueness contract', async () => {
  const database = notesDatabase(ownerId);

  await Promise.all([
    saveConceptNote(database, { userId: ownerId, conceptId, note: 'A' }),
    saveConceptNote(database, { userId: ownerId, conceptId, note: 'B' }),
    saveConceptNote(database, { userId: ownerId, conceptId, note: 'C' }),
  ]);

  assert.equal(database.rows.length, 1);
  assert.equal(database.rows[0].note, 'C');
});

test('empty text preserves the existing update-to-empty behavior', async () => {
  const database = notesDatabase(ownerId);
  await saveConceptNote(database, { userId: ownerId, conceptId, note: 'A' });
  const originalId = database.rows[0].id;

  await saveConceptNote(database, { userId: ownerId, conceptId, note: '' });

  assert.equal(database.rows.length, 1);
  assert.equal(database.rows[0].id, originalId);
  assert.equal(database.rows[0].note, '');
});

test('owner filtering prevents cross-owner reads and writes', async () => {
  const database = notesDatabase(ownerId);
  await saveConceptNote(database, { userId: ownerId, conceptId, note: 'Owner note' });

  assert.deepEqual(await loadConceptNote(database, 'owner-b', conceptId), {
    data: null,
    error: null,
  });

  const crossOwnerWrite = await saveConceptNote(database, {
    userId: 'owner-b',
    conceptId,
    note: 'Intruder note',
  });
  assert.equal(crossOwnerWrite.error?.code, '42501');
  assert.equal(database.rows.length, 1);
  assert.equal(database.rows[0].note, 'Owner note');
});
