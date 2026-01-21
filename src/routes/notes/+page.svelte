<script>
  import { onMount } from 'svelte';
  import { nanoid } from 'nanoid';
  import { get } from 'svelte/store';
  import { createNote, listNotes } from '$lib/api';
  import { encryptNote, decryptNote } from '$lib/crypto/notes';
  import { base64ToBytes, fromUtf8Bytes } from '$lib/crypto/encoding';
  import { addPendingNote, cacheNotes, readCachedNotes, readPendingNotes, removePendingNote } from '$lib/storage/notes';
  import { hasConvexUrl } from '$lib/convexClient';
  import { dekStore, onlineStore, sessionStore, syncStatusStore } from '$lib/state';

  let noteText = '';
  let error = '';
  let notes = [];
  let wasOnline = true;

  const loadCached = async () => {
    const session = get(sessionStore);
    const cached = await readCachedNotes(session?.userId);
    await hydrateNotes(cached);
  };

  const extractNoteKey = (record) => {
    if (!record?.aad) return record?.id;
    try {
      const payload = JSON.parse(fromUtf8Bytes(base64ToBytes(record.aad)));
      if (typeof payload?.noteId === 'string') {
        return payload.noteId;
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to parse note metadata', {
          id: record.id,
          error: err instanceof Error ? err.message : err
        });
      }
    }
    return record?.id;
  };

  const hydrateNotes = async (records) => {
    const dek = get(dekStore);
    if (!dek) return;
    const recordMap = new Map();
    for (const record of records) {
      const key = extractNoteKey(record);
      if (!key) continue;
      const existing = recordMap.get(key);
      if (!existing || record.createdAt > existing.createdAt) {
        recordMap.set(key, record);
      }
    }
    const uniqueRecords = [...recordMap.values()].sort((a, b) => b.createdAt - a.createdAt);
    const decrypted = await Promise.all(
      uniqueRecords.map(async (note) => {
        try {
          return {
            id: note.id,
            createdAt: note.createdAt,
            plaintext: await decryptNote(dek, note)
          };
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('Failed to decrypt cached note', {
              id: note.id,
              error: err instanceof Error ? err.message : err
            });
          }
          return null;
        }
      })
    );
    notes = decrypted.filter((note) => note !== null);
  };

  const fetchRemote = async () => {
    if (!hasConvexUrl) return;
    const session = get(sessionStore);
    if (!session) return;
    const remote = await listNotes({ sessionToken: session.sessionToken });
    const annotated = remote.notes.map((note) => ({ ...note, userId: session.userId }));
    await cacheNotes(annotated);
    const cached = await readCachedNotes(session.userId);
    await hydrateNotes(cached);
  };

  const syncAndRefresh = async () => {
    await syncPending();
    await fetchRemote();
  };

  const syncPending = async () => {
    if (!hasConvexUrl) return;
    const session = get(sessionStore);
    if (!session) return;
    if (!navigator.onLine) {
      syncStatusStore.set('offline');
      return;
    }
    syncStatusStore.set('syncing');
    const pending = await readPendingNotes(session.userId);
    await Promise.all(
      pending.map(async (note) => {
        await createNote({
          sessionToken: session.sessionToken,
          clientNoteId: note.id,
          ciphertext: note.ciphertext,
          nonce: note.nonce,
          aad: note.aad,
          version: note.version,
          createdAt: note.createdAt
        });
        await removePendingNote(note.id);
      })
    );
    syncStatusStore.set('idle');
  };

  const handleSave = async () => {
    const session = get(sessionStore);
    const dek = get(dekStore);
    if (!session || !dek) {
      error = 'Missing session or encryption key. Please login again.';
      return;
    }
    if (!hasConvexUrl) {
      error = 'Missing VITE_CONVEX_URL. Configure Convex to sync notes.';
      return;
    }
    if (!noteText.trim()) {
      error = 'Enter a note.';
      return;
    }

    const noteId = nanoid();
    const createdAt = Date.now();
    const encrypted = await encryptNote(dek, noteText, {
      userId: session.userId,
      noteId
    });

    const record = { id: noteId, userId: session.userId, createdAt, ...encrypted };
    await addPendingNote(record);
    await cacheNotes([record]);
    noteText = '';
    await loadCached();

    if (navigator.onLine) {
      await syncPending();
      await fetchRemote();
    }
  };

  onMount(async () => {
    await loadCached();
    wasOnline = navigator.onLine;
    if (navigator.onLine) {
      await syncAndRefresh();
    }
  });

  $: if (!$onlineStore) {
    syncStatusStore.set('offline');
  }

  $: {
    if ($onlineStore && !wasOnline) {
      void syncAndRefresh();
    }
    wasOnline = $onlineStore;
  }
</script>

{#if !$sessionStore || !$dekStore}
  <section class="card">
    <h2>Encrypted Notes</h2>
    <p class="helper">Please login to unlock your device key and decrypt notes.</p>
  </section>
{:else}
  <section class="card">
  <h2>Encrypted Notes</h2>
  <p class="helper">
    Notes are encrypted in your browser using the DEK. Convex only receives ciphertext, nonce, and metadata.
  </p>

  <div class="form">
    <label>
      New note
      <textarea bind:value={noteText} rows="4" placeholder="Write a secure note..."></textarea>
    </label>
    {#if error}
      <div class="error">{error}</div>
    {/if}
    <button on:click|preventDefault={handleSave}>Save note</button>
  </div>

  <div class="notes">
    {#if notes.length === 0}
      <p class="helper">No notes yet.</p>
    {:else}
      {#each notes as note}
        <article class="note">
          <div class="note__meta">{new Date(note.createdAt).toLocaleString()}</div>
          <div>{note.plaintext}</div>
        </article>
      {/each}
    {/if}
  </div>
  </section>
{/if}

<style>
  .notes {
    margin-top: 2rem;
    display: grid;
    gap: 1rem;
  }

  .note {
    padding: 1.25rem;
    border-radius: 1rem;
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
  }

  .note__meta {
    font-size: 0.75rem;
    color: var(--color-muted);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
