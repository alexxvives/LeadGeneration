"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adoptServerValue, type DraftState } from "@/lib/draft-sync";

/**
 * Controlled field with a local draft. Server/poll updates only replace the
 * text while the user is not editing it (see `adoptServerValue`), and a dirty
 * draft is saved on blur and on unmount. `onSave` may return a warning; the
 * typed text then stays in the field so nothing silently disappears.
 */
export function useDraftField(
  serverValue: string,
  onSave: (raw: string) => string | null | void,
  disabled = false,
) {
  const [value, setValue] = useState(serverValue);
  const [warning, setWarning] = useState<string | null>(null);
  const stateRef = useRef<DraftState>({ value: serverValue, focused: false, dirty: false });
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    const next = adoptServerValue(stateRef.current, serverValue);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setValue(next.value);
  }, [serverValue]);

  const commit = useCallback(() => {
    if (!stateRef.current.dirty || disabledRef.current) return;
    const result = saveRef.current(stateRef.current.value);
    if (typeof result === "string" && result) {
      setWarning(result);
      return; // keep the draft visible; stay dirty
    }
    setWarning(null);
    stateRef.current = { ...stateRef.current, dirty: false };
  }, []);

  // Escape / lead switch unmounts without blur — flush the draft.
  useEffect(() => () => commit(), [commit]);

  return {
    value,
    warning,
    onChange: (next: string) => {
      stateRef.current = { ...stateRef.current, value: next, dirty: true };
      setValue(next);
    },
    onFocus: () => {
      stateRef.current = { ...stateRef.current, focused: true };
    },
    onBlur: () => {
      stateRef.current = { ...stateRef.current, focused: false };
      commit();
    },
  };
}
