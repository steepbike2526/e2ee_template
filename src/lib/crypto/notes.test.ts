import { describe, expect, it } from 'vitest';
import { encryptNote, decryptNote } from './notes';
import { generateAesKey } from './keys';

describe('encryptNote/decryptNote', () => {
  it('round trips plaintext', async () => {
    const dek = await generateAesKey();
    const payload = await encryptNote(dek, 'hello', { userId: 'user_1', noteId: 'note_1' });
    const plaintext = await decryptNote(dek, payload);
    expect(plaintext).toBe('hello');
  });
});
