/**
 * Error handling example for @rstmdb/client
 *
 * Demonstrates: handling various error types and retry patterns
 */

import {
  Client,
  ClientOptions,
  RstmdbError,
  NotFoundError,
  ConflictError,
  InvalidTransitionError,
  AuthenticationError,
  ConnectionError,
  TimeoutError,
} from '@rstmdb/client';

// Simple retry helper
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Only retry if the error is retryable
      if (error instanceof RstmdbError && !error.retryable) {
        throw error;
      }

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

async function main() {
  // Using the builder pattern with custom timeout
  const config = ClientOptions.create('localhost')
    .auth('my-secret-token')
    .port(7401)
    .timeout({ request: 5000 })
    .build();

  const client = new Client(config);

  try {
    await client.connect();
    console.log('Connected to rstmdb\n');

    // Set up a simple machine
    await client.putMachine('order_error', 1, {
      states: ['created', 'paid', 'shipped'],
      initial: 'created',
      transitions: [
        { from: 'created', event: 'PAY', to: 'paid' },
        { from: 'paid', event: 'SHIP', to: 'shipped' },
      ],
    });

    // Example 1: NotFoundError
    console.log('--- Example 1: NotFoundError ---');
    try {
      await client.getInstance('nonexistent-instance-123');
    } catch (error) {
      if (error instanceof NotFoundError) {
        console.log('Instance not found:', error.message);
        console.log('Error code:', error.code);
        console.log('Retryable:', error.retryable);
      } else {
        throw error;
      }
    }

    // Example 2: InvalidTransitionError
    console.log('\n--- Example 2: InvalidTransitionError ---');
    const instance = await client.createInstance('order_error', 1);

    try {
      // Try to apply SHIP before PAY (invalid transition)
      await client.applyEvent(instance.instanceId, 'SHIP');
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        console.log('Invalid transition:', error.message);
        console.log('This error is not retryable - need to fix the business logic');
      } else {
        throw error;
      }
    }

    // Example 3: ConflictError with optimistic concurrency
    console.log('\n--- Example 3: ConflictError (Optimistic Concurrency) ---');
    await client.applyEvent(instance.instanceId, 'PAY'); // Move to 'paid'

    try {
      // Try to apply PAY again with expectedState='created' (wrong!)
      await client.applyEvent(instance.instanceId, 'PAY', {
        expectedState: 'created', // But it's actually 'paid'
      });
    } catch (error) {
      if (error instanceof ConflictError) {
        console.log('State conflict:', error.message);
        console.log('Details:', JSON.stringify(error.details));

        // Correct approach: re-fetch state and retry
        const current = await client.getInstance(instance.instanceId);
        console.log('Current state is:', current.state);
      } else {
        throw error;
      }
    }

    // Example 4: Retry pattern for transient errors
    console.log('\n--- Example 4: Retry Pattern ---');
    try {
      const result = await withRetry(
        async () => {
          // This would retry on connection/timeout errors
          return await client.applyEvent(instance.instanceId, 'SHIP');
        },
        3,
        500
      );
      console.log('Event applied successfully:', result.toState);
    } catch (error) {
      if (error instanceof RstmdbError) {
        console.log('Failed after retries:', error.message);
      }
    }

    // Example 5: Comprehensive error handling
    console.log('\n--- Example 5: Comprehensive Error Handling ---');
    async function safeApplyEvent(
      instanceId: string,
      event: string
    ): Promise<{ success: boolean; error?: string }> {
      try {
        await client.applyEvent(instanceId, event);
        return { success: true };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { success: false, error: 'Instance does not exist' };
        }
        if (error instanceof InvalidTransitionError) {
          return { success: false, error: `Cannot apply ${event} from current state` };
        }
        if (error instanceof ConflictError) {
          return { success: false, error: 'State changed, please refresh and retry' };
        }
        if (error instanceof AuthenticationError) {
          return { success: false, error: 'Not authorized to perform this action' };
        }
        if (error instanceof ConnectionError || error instanceof TimeoutError) {
          return { success: false, error: 'Server unavailable, please try again' };
        }
        // Unknown error - rethrow
        throw error;
      }
    }

    // Test the safe wrapper
    const safeResult = await safeApplyEvent(instance.instanceId, 'PAY'); // Already paid
    console.log('Safe apply result:', safeResult);
  } finally {
    await client.close();
    console.log('\nConnection closed');
  }
}

main().catch(console.error);
