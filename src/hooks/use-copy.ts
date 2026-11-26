'use client';

import { useState } from 'react';

/** How long the "copied" confirmation stays on the button. */
const CONFIRM_MS = 2500;

/**
 * Copy-to-clipboard with a short confirmation.
 *
 * A refused clipboard (permissions, non-secure context) is not an error the
 * reader needs to see: the text is still on the page, so the button simply does
 * not switch to "copied".
 *
 * @param text Text to place on the clipboard.
 * @returns `copied` and the `copy` handler for the button.
 */
export function useCopy(text: string): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), CONFIRM_MS);
    } catch {
      setCopied(false);
    }
  }

  return { copied, copy };
}
