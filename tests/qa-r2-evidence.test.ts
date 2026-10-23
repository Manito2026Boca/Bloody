import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Extract the actual private uploadOrderEvidence handler from the component source and run it
// against synthetic closures. Nothing is mounted and no real service, session or data is touched.
const source = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const ast = ts.createSourceFile('app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.FunctionDeclaration | undefined;
const find = (node: ts.Node) => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'uploadOrderEvidence') handler = node;
  else ts.forEachChild(node, find);
};
find(ast);
if (!handler) throw new Error('uploadOrderEvidence handler missing');

const closureNames = ['evidenceFile', 'evidenceStage', 'order', 'profile', 'setError', 'setNotice',
  'setUploadingEvidence', 'setEvidenceFile', 'evidenceForm', 'actionSafety', 'guardedAction',
  'uploadV6OrderEvidenceFile', 'addV6OrderPhoto', 'removeV6MediaFiles', 'refreshPhotos'];
const compiled = ts.transpileModule(handler.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const build = new Function(...closureNames, `${compiled}\nreturn uploadOrderEvidence;`) as
  (...deps: unknown[]) => (event: unknown) => Promise<void>;

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

function setup(options: { uploadError?: Error; insertError?: Error; file?: unknown } = {}) {
  const gate = deferred();
  const form = { reset: vi.fn() };
  const calls: string[] = [];
  const deps = {
    evidenceFile: 'file' in options ? options.file : { name: 'synthetic.jpg' },
    evidenceStage: 'during',
    order: { id: 'synthetic-order' },
    profile: { id: 'synthetic-pro' },
    setError: vi.fn(),
    setNotice: vi.fn(),
    setUploadingEvidence: vi.fn(),
    setEvidenceFile: vi.fn(),
    evidenceForm: { begin: vi.fn(), saved: vi.fn(), failed: vi.fn() },
    actionSafety: { set: vi.fn() },
    // Deferred so the handler is suspended at its first await, like a real network upload.
    guardedAction: vi.fn(async (action: () => Promise<unknown>) => { await gate.promise; return action(); }),
    uploadV6OrderEvidenceFile: vi.fn(async () => {
      calls.push('upload');
      if (options.uploadError) throw options.uploadError;
      return 'synthetic/path.jpg';
    }),
    addV6OrderPhoto: vi.fn(async () => {
      calls.push('insert');
      if (options.insertError) throw options.insertError;
    }),
    removeV6MediaFiles: vi.fn(async () => { calls.push('cleanup'); }),
    refreshPhotos: vi.fn(async () => { calls.push('refresh'); }),
  };
  const run = build(...closureNames.map(name => (deps as Record<string, unknown>)[name]));
  // React clears currentTarget once the synchronous part of the dispatch returns.
  const event = { preventDefault: vi.fn(), currentTarget: form as unknown };
  const start = () => {
    const pending = run(event);
    event.currentTarget = null;
    return pending;
  };
  return { deps, form, event, gate, calls, start };
}

describe('QA R2 evidence upload handler', () => {
  it('resets the form after durable success without a false error', async () => {
    const t = setup();
    const pending = t.start();
    t.gate.release();
    await pending;
    expect(t.calls).toEqual(['upload', 'insert', 'refresh']);
    expect(t.form.reset).toHaveBeenCalledTimes(1);
    expect(t.deps.setEvidenceFile).toHaveBeenCalledWith(null);
    expect(t.deps.setError).not.toHaveBeenCalled();
    expect(t.deps.actionSafety.set).not.toHaveBeenCalled();
    expect(t.deps.evidenceForm.failed).not.toHaveBeenCalled();
    expect(t.deps.evidenceForm.saved).toHaveBeenCalledTimes(1);
    expect(t.deps.setNotice).toHaveBeenCalledWith('Evidencia agregada al seguimiento.');
    expect(t.deps.removeV6MediaFiles).not.toHaveBeenCalled();
  });

  it('performs exactly one upload and one insert', async () => {
    const t = setup();
    const pending = t.start();
    t.gate.release();
    await pending;
    expect(t.deps.uploadV6OrderEvidenceFile).toHaveBeenCalledTimes(1);
    expect(t.deps.addV6OrderPhoto).toHaveBeenCalledTimes(1);
    expect(t.deps.addV6OrderPhoto).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'synthetic-order', uploadedBy: 'synthetic-pro', stage: 'during', filePath: 'synthetic/path.jpg',
    }));
  });

  it('keeps the draft and does not reset when upload fails, and a retry can succeed', async () => {
    const t = setup({ uploadError: new Error('synthetic upload failure') });
    const pending = t.start();
    t.gate.release();
    await pending;
    expect(t.deps.addV6OrderPhoto).not.toHaveBeenCalled();
    expect(t.deps.refreshPhotos).not.toHaveBeenCalled();
    expect(t.deps.removeV6MediaFiles).not.toHaveBeenCalled();
    expect(t.form.reset).not.toHaveBeenCalled();
    expect(t.deps.setEvidenceFile).not.toHaveBeenCalled();
    expect(t.deps.evidenceForm.saved).not.toHaveBeenCalled();
    expect(t.deps.evidenceForm.failed).toHaveBeenCalledTimes(1);
    expect(t.deps.actionSafety.set).toHaveBeenCalledWith('critical');
    expect(t.deps.setError).toHaveBeenCalledWith('synthetic upload failure');
    expect(t.deps.setUploadingEvidence.mock.calls).toEqual([[true], [false]]);

    // Retry: the handler is still usable and the draft file is still the one captured.
    const retry = setup();
    const again = retry.start();
    retry.gate.release();
    await again;
    expect(retry.deps.evidenceForm.saved).toHaveBeenCalledTimes(1);
    expect(retry.deps.setError).not.toHaveBeenCalled();
  });

  it('cleans up the uploaded file when the insert fails, without reset or saved', async () => {
    const t = setup({ insertError: new Error('synthetic insert failure') });
    const pending = t.start();
    t.gate.release();
    await pending;
    expect(t.calls).toEqual(['upload', 'insert', 'cleanup']);
    expect(t.deps.removeV6MediaFiles).toHaveBeenCalledWith(['synthetic/path.jpg']);
    expect(t.deps.refreshPhotos).not.toHaveBeenCalled();
    expect(t.form.reset).not.toHaveBeenCalled();
    expect(t.deps.setEvidenceFile).not.toHaveBeenCalled();
    expect(t.deps.evidenceForm.saved).not.toHaveBeenCalled();
    expect(t.deps.evidenceForm.failed).toHaveBeenCalledTimes(1);
    expect(t.deps.setError).toHaveBeenCalledWith('synthetic insert failure');
  });

  it('marks the submit busy while deferred and clears it afterwards on every outcome', async () => {
    const ok = setup();
    const pending = ok.start();
    expect(ok.deps.setUploadingEvidence.mock.calls).toEqual([[true]]);
    expect(ok.deps.evidenceForm.begin).toHaveBeenCalledTimes(1);
    expect(ok.event.preventDefault).toHaveBeenCalledTimes(1);
    ok.gate.release();
    await pending;
    expect(ok.deps.setUploadingEvidence.mock.calls).toEqual([[true], [false]]);

    for (const options of [{ uploadError: new Error('u') }, { insertError: new Error('i') }]) {
      const t = setup(options);
      const run = t.start();
      t.gate.release();
      await run;
      expect(t.deps.setUploadingEvidence.mock.calls).toEqual([[true], [false]]);
    }
  });

  it('does nothing durable when no file is selected', async () => {
    const t = setup({ file: null });
    await t.start();
    expect(t.deps.setError).toHaveBeenCalledWith('Elegí una foto para subir al seguimiento.');
    expect(t.deps.guardedAction).not.toHaveBeenCalled();
    expect(t.deps.uploadV6OrderEvidenceFile).not.toHaveBeenCalled();
    expect(t.deps.setUploadingEvidence).not.toHaveBeenCalled();
  });
});
