import Dexie from 'dexie';

/**
 * StudyMate local database (IndexedDB via Dexie.js)
 * 
 * Two tables:
 * - sessions: one row per study session (title, subject, topic, timestamps, duration, mood summary)
 * - messages: one row per turn in a session (linked by sessionId)
 * 
 * Everything lives entirely on-device. Nothing here ever touches a server —
 * this is a privacy-first design. The only exception is the optional CSV export.
 * 
 * Schema versions
 * ───────────────
 * v1 — initial schema (sessions + messages)
 * v2 — adds topic, startedAt, durationSeconds to sessions
 *       Existing rows get topic: null, startedAt: createdAt, durationSeconds: null
 *       so old pilot data isn't lost — it just shows empty in the export.
 */

export const db = new Dexie('studymate-db');

// v1 — keep this intact so Dexie can upgrade existing installs correctly
db.version(1).stores({
  sessions: '++id, updatedAt',
  messages: '++id, sessionId, createdAt',
});

// v2 — new fields on sessions; no structural index changes needed
db.version(2).stores({
  sessions: '++id, updatedAt',
  messages: '++id, sessionId, createdAt',
}).upgrade(tx => {
  // Back-fill existing sessions so the schema is consistent
  return tx.table('sessions').toCollection().modify(session => {
    if (session.topic === undefined)           session.topic = null;
    if (session.startedAt === undefined)       session.startedAt = session.createdAt ?? new Date();
    if (session.durationSeconds === undefined) session.durationSeconds = null;
  });
});

// ─────────────────────────────────────────────
// Session helpers
// ─────────────────────────────────────────────

/**
 * Creates a new session row and returns its generated id.
 * @param {string} title       - Display title (auto-updated after first message)
 * @param {string|null} subject - Legacy subject field (kept for back-compat)
 * @param {string|null} topic   - What the student is studying this session
 *                                e.g. "Organic Chemistry — alkenes"
 */
export async function createSession(title = 'New session', subject = null, topic = null) {
  const now = new Date();
  const id = await db.sessions.add({
    title,
    subject,
    topic,
    createdAt: now,
    updatedAt: now,
    startedAt: now,          // used to compute duration on session end
    durationSeconds: null,   // written by finaliseSession()
    lastEmotionalState: null,
  });
  return id;
}

/**
 * Appends a message to a session and bumps the session's updatedAt.
 */
export async function addMessage(sessionId, message) {
  await db.messages.add({
    sessionId,
    role: message.role,
    content: message.content,
    inputMode: message.inputMode ?? null,
    emotionalState: message.emotionalState ?? null,
    fusedScore: message.fusedScore ?? null,
    createdAt: new Date(),
  });

  await db.sessions.update(sessionId, {
    updatedAt: new Date(),
    ...(message.emotionalState ? { lastEmotionalState: message.emotionalState } : {}),
  });
}

/**
 * Writes the final duration for a session.
 * Call this when the student explicitly ends a session or navigates away.
 * Duration is derived from startedAt → now rather than a running timer so
 * it survives page refreshes.
 * 
 * @param {number} sessionId
 */
export async function finaliseSession(sessionId) {
  const session = await db.sessions.get(sessionId);
  if (!session) return;

  const startedAt = session.startedAt instanceof Date
    ? session.startedAt
    : new Date(session.startedAt);

  const durationSeconds = Math.round((Date.now() - startedAt.getTime()) / 1000);

  await db.sessions.update(sessionId, { durationSeconds });
}

/**
 * Updates the title of a session (auto-titled from first student message).
 */
export async function renameSession(sessionId, title) {
  await db.sessions.update(sessionId, { title });
}

/**
 * Updates the topic of a session (can be set or changed after creation).
 */
export async function updateSessionTopic(sessionId, topic) {
  await db.sessions.update(sessionId, { topic });
}

/**
 * Deletes a session and all of its messages.
 */
export async function deleteSession(sessionId) {
  await db.transaction('rw', db.sessions, db.messages, async () => {
    await db.messages.where('sessionId').equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

// ─────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────

/**
 * Exports all sessions and messages as a flat array of rows for the pilot.
 * Each row is one message, enriched with its parent session's metadata.
 * New columns: topic, sessionDurationSeconds.
 */
export async function exportAllDataAsRows() {
  const sessions = await db.sessions.toArray();
  const messages = await db.messages.toArray();

  const sessionById = Object.fromEntries(sessions.map(s => [s.id, s]));

  return messages.map(m => {
    const session = sessionById[m.sessionId];
    return {
      sessionId:              m.sessionId,
      sessionTitle:           session?.title ?? '',
      topic:                  session?.topic ?? '',
      sessionDurationSeconds: session?.durationSeconds ?? '',
      role:                   m.role,
      content:                m.content,
      inputMode:              m.inputMode ?? '',
      emotionalState:         m.emotionalState ?? '',
      fusedScore:             m.fusedScore ?? '',
      createdAt:              m.createdAt instanceof Date
                                ? m.createdAt.toISOString()
                                : m.createdAt,
    };
  });
}