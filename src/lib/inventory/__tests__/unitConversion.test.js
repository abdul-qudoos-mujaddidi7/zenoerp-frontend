import { describe, it, expect, vi, beforeEach } from 'vitest';

const units = [
  { id: 1, name: 'Kilogram', code: 'kg', subunit_id: 2, subunit_multiple: 1000, status: 1 },
  { id: 2, name: 'Gram', code: 'gr', subunit_id: null, subunit_multiple: null, status: 1 },
];

vi.mock('../../../db.js', () => ({
  db: {
    product_units: {
      where: () => ({
        equals: () => ({
          toArray: async () => units,
        }),
      }),
    },
  },
}));

describe('convertUnit', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('converts grams to kilograms for stock deduction', async () => {
    const { convertUnit } = await import('../../../pages/stocktransactions/calculateStock.js');
    const result = await convertUnit(500, 2, 1);
    expect(result).toBe(0.5);
  });

  it('keeps quantity unchanged when units match', async () => {
    const { convertUnit } = await import('../../../pages/stocktransactions/calculateStock.js');
    const result = await convertUnit(30, 1, 1);
    expect(result).toBe(30);
  });
});
