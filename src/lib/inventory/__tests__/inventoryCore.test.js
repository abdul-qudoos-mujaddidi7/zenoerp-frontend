import { describe, it, expect } from 'vitest';
import {
  allocateBatchConsumption,
  toInventoryDecimal,
  decimal,
  InventoryMethod,
} from '../inventoryCore.js';

describe('allocateBatchConsumption', () => {
  const batches = [
    {
      id: 1,
      received_at: '2024-01-01T00:00:00.000Z',
      quantity_remaining: '10.000000',
      unit_cost: '20.000000',
      status: 1,
      is_closed: 0,
    },
    {
      id: 2,
      received_at: '2024-01-02T00:00:00.000Z',
      quantity_remaining: '30.000000',
      unit_cost: '40.000000',
      status: 1,
      is_closed: 0,
    },
  ];

  it('FIFO consumes oldest layers first (10@20 + 15@40 = 800)', () => {
    const result = allocateBatchConsumption({
      batches,
      quantity: '25',
      inventoryMethod: InventoryMethod.FIFO,
    });
    expect(result.totalCogs).toBe('800.000000');
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].quantity).toBe('10.000000');
    expect(result.layers[1].quantity).toBe('15.000000');
  });

  it('LIFO consumes newest layers first (25@40 = 1000)', () => {
    const result = allocateBatchConsumption({
      batches,
      quantity: '25',
      inventoryMethod: InventoryMethod.LIFO,
    });
    expect(result.totalCogs).toBe('1000.000000');
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].quantity).toBe('25.000000');
  });

  it('supports decimal quantity 0.1', () => {
    const tinyBatches = [
      {
        id: 3,
        received_at: '2024-01-01T00:00:00.000Z',
        quantity_remaining: '1.000000',
        unit_cost: '10.000000',
        status: 1,
        is_closed: 0,
      },
    ];
    const result = allocateBatchConsumption({
      batches: tinyBatches,
      quantity: '0.1',
      inventoryMethod: InventoryMethod.FIFO,
    });
    expect(result.totalCogs).toBe('1.000000');
  });

  it('throws when insufficient stock', () => {
    expect(() =>
      allocateBatchConsumption({
        batches,
        quantity: '100',
        inventoryMethod: InventoryMethod.FIFO,
      }),
    ).toThrow('Not enough stock');
  });
});

describe('decimal helpers', () => {
  it('stores six-decimal inventory strings', () => {
    expect(toInventoryDecimal('10')).toBe('10.000000');
    expect(toInventoryDecimal(0.1)).toBe('0.100000');
    expect(toInventoryDecimal(125.5)).toBe('125.500000');
  });

  it('adds decimal strings safely', () => {
    expect(decimal('0.1').plus('0.2').toFixed(6)).toBe('0.300000');
  });
});
