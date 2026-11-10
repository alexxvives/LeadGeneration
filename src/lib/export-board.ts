/** Board id for Excel export. `null` means every board the user can see. */
export function exportBoardParam(
  filterBoardId: string | null | undefined,
): string | null {
  if (!filterBoardId || filterBoardId === "all") return null;
  return filterBoardId;
}
