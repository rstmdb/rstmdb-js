import { SubscriptionHandler, type StreamEvent } from './subscription.js';
import type { StreamEventMessage } from '../protocol/messages.js';

/**
 * Manages active subscriptions.
 */
export class SubscriptionManager {
  private subscriptions = new Map<string, SubscriptionHandler>();

  /**
   * Register a new subscription.
   */
  register(subscriptionId: string, handler: SubscriptionHandler): void {
    this.subscriptions.set(subscriptionId, handler);
  }

  /**
   * Unregister a subscription.
   */
  unregister(subscriptionId: string): void {
    const handler = this.subscriptions.get(subscriptionId);
    if (handler) {
      handler.close();
      this.subscriptions.delete(subscriptionId);
    }
  }

  /**
   * Get a subscription handler.
   */
  get(subscriptionId: string): SubscriptionHandler | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Check if a subscription exists.
   */
  has(subscriptionId: string): boolean {
    return this.subscriptions.has(subscriptionId);
  }

  /**
   * Dispatch an event to the appropriate subscription.
   */
  dispatch(message: StreamEventMessage): void {
    const handler = this.subscriptions.get(message.subscription_id);
    if (!handler) {
      return;
    }

    const event: StreamEvent = {
      subscriptionId: message.subscription_id,
      instanceId: message.instance_id,
      machine: message.machine,
      version: message.version,
      walOffset: BigInt(message.wal_offset),
      fromState: message.from_state,
      toState: message.to_state,
      event: message.event,
      payload: message.payload,
      ctx: message.ctx,
    };

    handler.push(event);
  }

  /**
   * End a subscription (e.g., when server sends end message).
   */
  end(subscriptionId: string, error?: Error): void {
    const handler = this.subscriptions.get(subscriptionId);
    if (handler) {
      handler.close(error);
      this.subscriptions.delete(subscriptionId);
    }
  }

  /**
   * Close all subscriptions (e.g., on disconnect).
   */
  closeAll(error?: Error): void {
    for (const handler of this.subscriptions.values()) {
      handler.close(error);
    }
    this.subscriptions.clear();
  }

  /**
   * Get the number of active subscriptions.
   */
  get size(): number {
    return this.subscriptions.size;
  }
}
