export function specialtyEditorExitDecision({ saving, unsaved }: { saving: boolean; unsaved: boolean }) {
  if (saving) return 'wait';
  if (unsaved) return 'confirm';
  return 'close';
}
