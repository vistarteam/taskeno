import { describe, expect, it } from 'vitest';
import { AppError } from '../src/common/errors';
import { OrderStateMachine } from '../src/modules/orders/order-state-machine';

describe('order state machine', () => {
  it('walks the happy path from payment to completion', () => {
    expect(OrderStateMachine.resolve('pending_payment', 'pay', 'system')).toBe('paid');
    expect(OrderStateMachine.resolve('paid', 'accept', 'provider')).toBe('accepted');
    expect(OrderStateMachine.resolve('accepted', 'start', 'provider')).toBe('in_progress');
    expect(OrderStateMachine.resolve('in_progress', 'deliver', 'provider')).toBe('delivered');
    expect(OrderStateMachine.resolve('delivered', 'complete', 'buyer')).toBe('completed');
  });

  it('rejects transitions performed by the wrong participant', () => {
    // A buyer may not accept their own order or deliver the work.
    expect(() => OrderStateMachine.resolve('paid', 'accept', 'buyer')).toThrow(AppError);
    expect(() => OrderStateMachine.resolve('in_progress', 'deliver', 'buyer')).toThrow(AppError);
    // A provider may not release their own escrow by completing the order.
    expect(() => OrderStateMachine.resolve('delivered', 'complete', 'provider')).toThrow(AppError);
    // A buyer may not resolve a dispute in their own favour.
    expect(() => OrderStateMachine.resolve('disputed', 'resolve_complete', 'buyer')).toThrow(AppError);
  });

  it('rejects invalid status jumps', () => {
    expect(() => OrderStateMachine.resolve('pending_payment', 'complete', 'buyer')).toThrow(AppError);
    expect(() => OrderStateMachine.resolve('completed', 'deliver', 'provider')).toThrow(AppError);
    expect(() => OrderStateMachine.resolve('cancelled', 'accept', 'provider')).toThrow(AppError);
    expect(OrderStateMachine.can('completed', 'cancel', 'buyer')).toBe(false);
  });

  it('only lets admins move a disputed order', () => {
    expect(OrderStateMachine.resolve('disputed', 'resolve_complete', 'admin')).toBe('completed');
    expect(OrderStateMachine.resolve('disputed', 'resolve_refund', 'admin')).toBe('refunded');
    expect(OrderStateMachine.can('disputed', 'complete', 'buyer')).toBe(false);
  });

  it('exposes only the actions the current actor may take', () => {
    const buyerActions = OrderStateMachine.availableActions('delivered', 'buyer');
    expect(buyerActions).toContain('complete');
    expect(buyerActions).toContain('dispute');
    expect(buyerActions).not.toContain('deliver');

    const providerActions = OrderStateMachine.availableActions('delivered', 'provider');
    expect(providerActions).not.toContain('complete');

    expect(OrderStateMachine.availableActions('completed', 'buyer')).toEqual([]);
  });

  it('reports progress for the UI timeline', () => {
    expect(OrderStateMachine.progress('pending_payment')).toBe(0);
    expect(OrderStateMachine.progress('completed')).toBe(5);
  });
});
