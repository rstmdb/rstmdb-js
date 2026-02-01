import { EventEmitter } from 'events';

/**
 * A stream event from a watch subscription.
 */
export interface StreamEvent {
  /** Subscription ID */
  subscriptionId: string;

  /** Instance ID */
  instanceId: string;

  /** Machine name */
  machine: string;

  /** Machine version */
  version: number;

  /** WAL offset */
  walOffset: bigint;

  /** Source state */
  fromState: string;

  /** Target state */
  toState: string;

  /** Event name */
  event: string;

  /** Event payload */
  payload?: Record<string, unknown>;

  /** Instance context */
  ctx?: Record<string, unknown>;
}

/**
 * Options for WATCH_INSTANCE operation.
 */
export interface WatchOptions {
  /** Include context in events. Default: true */
  includeCtx?: boolean;

  /** Replay events from this offset */
  fromOffset?: bigint;
}

/**
 * Options for WATCH_ALL operation.
 */
export interface WatchAllOptions extends WatchOptions {
  /** Filter by machine names */
  machines?: string[];

  /** Filter by source states */
  fromStates?: string[];

  /** Filter by target states */
  toStates?: string[];

  /** Filter by event names */
  events?: string[];
}

/**
 * A subscription to watch events.
 */
export interface Subscription {
  /** Subscription ID */
  readonly subscriptionId: string;

  /** AsyncIterator for for-await-of loops */
  [Symbol.asyncIterator](): AsyncIterator<StreamEvent>;

  /** Register event listener */
  on(event: 'event', listener: (event: StreamEvent) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'end', listener: () => void): this;

  /** Remove event listener */
  off(event: 'event', listener: (event: StreamEvent) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
  off(event: 'end', listener: () => void): this;

  /** Cancel the subscription */
  unsubscribe(): Promise<void>;
}

/**
 * Internal subscription handler implementation.
 */
export class SubscriptionHandler extends EventEmitter implements Subscription {
  readonly subscriptionId: string;

  private events: StreamEvent[] = [];
  private waiters: Array<{
    resolve: (result: IteratorResult<StreamEvent>) => void;
    reject: (error: Error) => void;
  }> = [];
  private closed = false;
  private closeError?: Error;
  private unsubscribeFn: () => Promise<void>;

  constructor(subscriptionId: string, unsubscribeFn: () => Promise<void>) {
    super();
    this.subscriptionId = subscriptionId;
    this.unsubscribeFn = unsubscribeFn;
  }

  /**
   * Push an event to the subscription.
   */
  push(event: StreamEvent): void {
    if (this.closed) return;

    // If there are waiters, resolve the first one
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: event, done: false });
    } else {
      // Otherwise, queue the event
      this.events.push(event);
    }

    // Emit for event listener style
    this.emit('event', event);
  }

  /**
   * Close the subscription with an optional error.
   */
  close(error?: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.closeError = error;

    // Reject or complete all waiters
    for (const waiter of this.waiters) {
      if (error) {
        waiter.reject(error);
      } else {
        waiter.resolve({ value: undefined, done: true });
      }
    }
    this.waiters = [];

    // Emit end/error events
    if (error) {
      this.emit('error', error);
    }
    this.emit('end');
  }

  /**
   * AsyncIterator implementation.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    while (true) {
      // Check if closed
      if (this.closed) {
        if (this.closeError) {
          throw this.closeError;
        }
        // Drain remaining events
        while (this.events.length > 0) {
          yield this.events.shift()!;
        }
        return;
      }

      // Return queued event if available
      if (this.events.length > 0) {
        yield this.events.shift()!;
        continue;
      }

      // Wait for next event
      const result = await new Promise<IteratorResult<StreamEvent>>((resolve, reject) => {
        this.waiters.push({ resolve, reject });
      });

      if (result.done) {
        return;
      }

      yield result.value;
    }
  }

  /**
   * Cancel the subscription.
   */
  async unsubscribe(): Promise<void> {
    if (!this.closed) {
      await this.unsubscribeFn();
      this.close();
    }
  }

  /**
   * Check if the subscription is closed.
   */
  get isClosed(): boolean {
    return this.closed;
  }
}
