import { describe, expect, it } from 'vitest';
import stylesheet from './BookingPage.module.css?raw';

function blockFor(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(`Bloco CSS não encontrado: ${marker}`);
  }

  const openingBraceIndex = source.indexOf('{', markerIndex);

  if (openingBraceIndex === -1) {
    throw new Error(`Bloco CSS sem abertura: ${marker}`);
  }

  let depth = 0;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const character = source[index];

    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(openingBraceIndex + 1, index);
      }
    }
  }

  throw new Error(`Bloco CSS sem fechamento: ${marker}`);
}

function declarationsFor(selector: string, source = stylesheet): Map<string, string> {
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let ruleMatch: RegExpExecArray | null;

  while ((ruleMatch = rulePattern.exec(source))) {
    const selectors = ruleMatch[1]
      ?.split(',')
      .map((candidate) => candidate.trim())
      .filter(Boolean);

    if (!selectors?.includes(selector) || !ruleMatch[2]) {
      continue;
    }

    return new Map(
      ruleMatch[2]
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

  throw new Error(`Regra CSS não encontrada: ${selector}`);
}

describe('BookingPage period shift CSS contract', () => {
  it('makes the period fieldset an inline-size query container', () => {
    expect(declarationsFor('.periodFieldset').get('container-type')).toBe('inline-size');
  });

  it('uses the rendered shift count for the compact mobile grid without auto-fit', () => {
    const shiftGrid = declarationsFor('.periodShiftGrid');

    expect(shiftGrid.get('display')).toBe('grid');
    expect(shiftGrid.get('grid-template-columns')).toBe(
      'repeat(var(--shift-columns, 1), minmax(0, 1fr))',
    );
    expect(stylesheet).not.toContain('auto-fit');
  });

  it('shows only the compact ordinal label in the base mobile layout', () => {
    const compactLabel = declarationsFor('.periodLabelCompact');
    const periodOption = declarationsFor('.periodOption');

    expect(declarationsFor('.periodLabelFull').get('display')).toBe('none');
    expect(declarationsFor('.periodTime').get('display')).toBe('none');
    expect(compactLabel.get('display')).toBe('inline');
    expect(compactLabel.get('min-width')).toBe('0');
    expect(compactLabel.get('overflow')).toBe('hidden');
    expect(compactLabel.get('text-overflow')).toBe('ellipsis');
    expect(periodOption.get('gap')).toBe('0.25rem');
    expect(periodOption.get('padding')).toBe('0.375rem 0.1875rem');
    expect(declarationsFor('.periodOption > svg').get('flex')).toBe('0 0 auto');
  });

  it('expands labels and times for two shifts at 28rem', () => {
    const containerQuery = blockFor(stylesheet, '@container (min-width: 28rem)');

    expect(
      declarationsFor(
        ".periodShiftGrid[data-shift-count='2'] .periodLabelFull",
        containerQuery,
      ).get('display'),
    ).toBe('block');
    expect(
      declarationsFor(".periodShiftGrid[data-shift-count='2'] .periodTime", containerQuery).get(
        'display',
      ),
    ).toBe('inline');
    expect(
      declarationsFor(
        ".periodShiftGrid[data-shift-count='2'] .periodLabelCompact",
        containerQuery,
      ).get('display'),
    ).toBe('none');
  });

  it('expands labels and times for every shift count at 42rem', () => {
    const containerQuery = blockFor(stylesheet, '@container (min-width: 42rem)');

    expect(declarationsFor('.periodLabelFull', containerQuery).get('display')).toBe('block');
    expect(declarationsFor('.periodTime', containerQuery).get('display')).toBe('inline');
    expect(declarationsFor('.periodLabelCompact', containerQuery).get('display')).toBe('none');
  });

  it('stretches each period option across its shift column', () => {
    expect(declarationsFor('.periodOption').get('width')).toBe('100%');
  });

  it('truncates long visual labels while keeping the grid shrinkable', () => {
    const shiftName = declarationsFor('.periodShiftLegend strong');
    const periodLabel = declarationsFor('.periodLabelFull');

    expect(shiftName.get('min-width')).toBe('0');
    expect(shiftName.get('overflow')).toBe('hidden');
    expect(shiftName.get('text-overflow')).toBe('ellipsis');
    expect(periodLabel.get('min-width')).toBe('0');
    expect(periodLabel.get('overflow')).toBe('hidden');
    expect(periodLabel.get('text-overflow')).toBe('ellipsis');
  });

  it('keeps the date above the shift columns until a wide desktop layout', () => {
    const tabletRules = blockFor(stylesheet, '@media (min-width: 48rem)');
    const desktopRules = blockFor(stylesheet, '@media (min-width: 64rem)');
    const scheduleFields = declarationsFor('.scheduleFields', desktopRules);

    expect(tabletRules).not.toContain('.scheduleFields');
    expect(scheduleFields.get('grid-template-columns')).toBe('minmax(12rem, 14rem) minmax(0, 1fr)');
  });

  it('does not restore the former per-chip shift label', () => {
    expect(stylesheet).not.toMatch(/\.periodShift(?![\w-])/);
  });
});
