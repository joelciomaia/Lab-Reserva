import { describe, expect, it } from 'vitest';
import stylesheet from './WeeklyCalendar.module.css?raw';

function declarationsFor(selector: string): Map<string, string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(stylesheet);

  if (!match?.[1]) {
    throw new Error(`Regra CSS não encontrada: ${selector}`);
  }

  return new Map(
    match[1]
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separatorIndex = declaration.indexOf(':');
        const property = declaration.slice(0, separatorIndex).trim();
        const value = declaration
          .slice(separatorIndex + 1)
          .trim()
          .replace(/\s+/g, ' ');

        return [property, value];
      }),
  );
}

describe('WeeklyCalendar mobile CSS contract', () => {
  it('contains horizontal overflow inside the viewport', () => {
    const viewport = declarationsFor('.viewport');

    expect(viewport.get('overflow-x')).toMatch(/^(?:hidden|clip)$/);
  });

  it('keeps the mobile grid fluid and aware of the rendered day count', () => {
    const grid = declarationsFor('.grid');

    expect(grid.get('grid-template-columns')).toContain(
      'repeat(var(--day-count, 5), minmax(0, 1fr))',
    );
    expect(grid.get('width')).toBe('100%');
    expect(grid.get('min-width')).toBe('0');
  });

  it('uses compact, bounded row heights for variable school schedules', () => {
    const grid = declarationsFor('.grid');

    expect(grid.get('--period-row-height')).toBe('4rem');
    expect(grid.get('grid-template-rows')).toBe('3.5rem');
    expect(grid.get('grid-auto-rows')).toBe('var(--period-row-height)');
    expect(declarationsFor(".grid[data-density='regular']").get('--period-row-height')).toBe(
      '3.75rem',
    );
    expect(declarationsFor(".grid[data-density='compact']").get('--period-row-height')).toBe(
      '3.25rem',
    );
    expect(declarationsFor(".grid[data-density='dense']").get('--period-row-height')).toBe('3rem');
  });

  it('does not restore the former wide minimum widths', () => {
    expect(stylesheet).not.toMatch(/\b(?:51\.75|57\.25)rem\b/);
  });

  it.each(['.slotCell', '.freeSlot', '.event'])(
    'allows %s to shrink inside compact columns',
    (selector) => {
      expect(declarationsFor(selector).get('min-width')).toBe('0');
    },
  );
});
