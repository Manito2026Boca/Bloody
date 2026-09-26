import { describe, expect, it } from 'vitest';
import { specialtyEditorExitDecision } from '../app/lib/specialtyEditorNavigation';

describe('professional specialty editor exit', () => {
  it('closes directly when there are no unsaved changes', () => {
    expect(specialtyEditorExitDecision({ saving: false, unsaved: false })).toBe('close');
  });

  it('asks before discarding unsaved changes', () => {
    expect(specialtyEditorExitDecision({ saving: false, unsaved: true })).toBe('confirm');
  });

  it('keeps the editor open while a save is in progress', () => {
    expect(specialtyEditorExitDecision({ saving: true, unsaved: true })).toBe('wait');
    expect(specialtyEditorExitDecision({ saving: true, unsaved: false })).toBe('wait');
  });
});
