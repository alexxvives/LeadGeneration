/**
 * Refresh-safe local drafts. The 10s board poll (and other users' edits)
 * must never replace text the user is typing: a server value is adopted only
 * while the field is neither focused nor dirty. Pure so it can be tested.
 */
export interface DraftState {
  value: string;
  focused: boolean;
  dirty: boolean;
}

export function adoptServerValue(state: DraftState, serverValue: string): DraftState {
  if (state.focused || state.dirty) return state;
  if (state.value === serverValue) return state;
  return { ...state, value: serverValue };
}

export function editDraft(state: DraftState, next: string): DraftState {
  return { ...state, value: next, dirty: true };
}

/** After a successful save the draft is clean again and can follow the server. */
export function markSaved(state: DraftState): DraftState {
  return { ...state, dirty: false };
}
