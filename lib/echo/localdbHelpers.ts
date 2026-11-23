/** Clear only the real-library stores (used by import-replace).
 *  v2: the canonical works + relationship stores are library data too. */

import { openDB, STORES } from "./localdb";

export async function clearLibraryStores(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(
      [STORES.media, STORES.entries, STORES.feedback, STORES.works, STORES.workLinks],
      "readwrite",
    );
    t.objectStore(STORES.media).clear();
    t.objectStore(STORES.entries).clear();
    t.objectStore(STORES.feedback).clear();
    t.objectStore(STORES.works).clear();
    t.objectStore(STORES.workLinks).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
