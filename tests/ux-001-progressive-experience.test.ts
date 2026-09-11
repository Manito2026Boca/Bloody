import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = readFileSync(join(process.cwd(), 'app/components/ManitoV6App.tsx'), 'utf8');
const navigation = readFileSync(join(process.cwd(), 'app/components/ManitoUx.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

describe('UX-001 progressive experience', () => {
  it('keeps role-specific navigation compact and independent from availability', () => {
    for (const label of ['Inicio', 'Trabajos', 'Mensajes', 'Cuenta', 'Hoy', 'Agenda']) {
      expect(navigation).toContain(`label: '${label}'`);
    }
    expect(navigation).toContain("const clientNavigation");
    expect(navigation).toContain("const professionalNavigation");
    expect(navigation).not.toContain('setV6Availability');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
  });

  it('starts the client experience from a need instead of a contracting mode', () => {
    expect(app).toContain('¿Qué necesitás resolver?');
    expect(app).toContain("const [modeChosen, setModeChosen] = useState(Boolean(editingOrder))");
    expect(app).toContain("setError('Elegí cómo querés avanzar.')");
    expect(app).toContain('v6-legacy-home-hidden');
  });

  it('implements the five progressive request stages without resetting entered state', () => {
    for (const step of ["'need'", "'place'", "'mode'", "'resolution'", "'review'"]) {
      expect(app).toContain(step);
    }
    expect(app).toContain('<RequestProgress steps={requestStepLabels} current={requestStepIndex} />');
    expect(app).toContain('function previousRequestStep()');
    expect(app).not.toMatch(/function previousRequestStep\(\)[\s\S]{0,400}setDescription\(''\)/);
  });

  it('requires structured specialty and requests GPS only inside the request', () => {
    expect(app).toContain("setError('Elegí la especialidad que mejor describe el trabajo.')");
    expect(app).toContain('<MatchingLocation value={locationId}');
    expect(app).toContain("requestStep === 'place'");
    expect(app).toMatch(/className="v6-header-location"[^>]*onClick=/);
    expect(app).toContain('Te pediremos permiso sólo ahora.');
  });

  it('surfaces the active work and its next action with human status labels', () => {
    expect(app).toContain('orderNextStepText');
    expect(app).toContain('TRABAJO ACTIVO');
    expect(app).toContain('PRÓXIMO TRABAJO');
    expect(app).toContain('PIN de inicio');
    expect(app).toContain('Revisá cualquier adicional');
    expect(app).toContain('Calificar');
    expect(app).toContain("order.mode !== 'quote' || !isOpenOpportunityStatus(order.status)");
  });

  it('keeps proposal comparison neutral and distinguishes material information', () => {
    expect(app).toContain('proposalMaterialsText');
    expect(app).toContain('Materiales incluidos');
    expect(app).toContain('Materiales no incluidos');
    expect(app).toContain('Materiales sin especificar');
    expect(app).not.toContain('Mejor opción');
    expect(app).not.toContain('Más conveniente');
  });

  it('protects the mobile viewport and safe areas', () => {
    expect(css).toContain('max-width: 100%');
    expect(css).toContain('overflow-x: hidden');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('@media (max-width: 430px)');
  });
});
