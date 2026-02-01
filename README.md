# @rstmdb/client

[![CI](https://github.com/rstmdb/rstmdb-js/actions/workflows/ci.yml/badge.svg)](https://github.com/rstmdb/rstmdb-js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@rstmdb/client.svg)](https://www.npmjs.com/package/@rstmdb/client)
[![npm downloads](https://img.shields.io/npm/dm/@rstmdb/client.svg)](https://www.npmjs.com/package/@rstmdb/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

Official Node.js/TypeScript client for rstmdb - a distributed state machine database.

## Installation

```bash
npm install @rstmdb/client
# or
pnpm add @rstmdb/client
# or
yarn add @rstmdb/client
```

**Requirements:** Node.js 18.0.0 or later

## Quick Start

```typescript
import { Client } from '@rstmdb/client';

// Connect using the static factory method
const client = await Client.connect('localhost', 7401, {
  auth: 'your-token',
});

// Register a state machine
await client.putMachine('order', 1, {
  states: ['created', 'paid', 'shipped', 'delivered'],
  initial: 'created',
  transitions: [
    { from: 'created', event: 'PAY', to: 'paid' },
    { from: 'paid', event: 'SHIP', to: 'shipped' },
    { from: 'shipped', event: 'DELIVER', to: 'delivered' },
  ],
});

// Create an instance
const instance = await client.createInstance('order', 1, {
  initialCtx: { customerId: 'c-123', items: ['item-1', 'item-2'] },
});

console.log(`Created order: ${instance.instanceId}`);
console.log(`Initial state: ${instance.state}`);

// Apply events to transition state
const result = await client.applyEvent(instance.instanceId, 'PAY', {
  payload: { amount: 99.99, paymentMethod: 'card' },
});

console.log(`State: ${result.fromState} -> ${result.toState}`);

await client.close();
```

## Configuration

### Quick Connect (Static Factory)

The simplest way to connect:

```typescript
// Basic connection
const client = await Client.connect('localhost', 7401);

// With authentication
const client = await Client.connect('localhost', 7401, {
  auth: 'your-token',
});

// With TLS
const client = await Client.connect('localhost', 7401, {
  auth: 'your-token',
  tls: true,
  clientName: 'my-service',
});
```

### Builder Pattern (Full Control)

Use `ClientOptions` builder for complex configurations:

```typescript
import { Client, ClientOptions } from '@rstmdb/client';

const config = ClientOptions.create('localhost')
  .port(7401)
  .auth('your-token')
  .tls({
    ca: fs.readFileSync('ca.pem'),
    cert: fs.readFileSync('client.pem'), // For mTLS
    key: fs.readFileSync('client-key.pem'),
    rejectUnauthorized: true,
  })
  .timeout({ connect: 5000, request: 30000 })
  .reconnect({ enabled: true, interval: 2000, maxAttempts: 10 })
  .clientName('my-service')
  .build();

const client = new Client(config);
await client.connect();
```

### Configuration Options

| Option                 | Default  | Description                                 |
| ---------------------- | -------- | ------------------------------------------- |
| `host`                 | required | Server hostname                             |
| `port`                 | `7401`   | Server port                                 |
| `connectTimeout`       | `10000`  | Connection timeout (ms)                     |
| `requestTimeout`       | `30000`  | Request timeout (ms)                        |
| `authToken`            | -        | Bearer token for authentication             |
| `tls`                  | -        | `true` for system CA, or `TlsConfig` object |
| `reconnect`            | `true`   | Auto-reconnect on disconnect                |
| `reconnectInterval`    | `1000`   | Initial reconnect delay (ms)                |
| `reconnectMaxAttempts` | `10`     | Max reconnection attempts                   |
| `clientName`           | -        | Client identifier sent in handshake         |

## API Reference

### Connection Lifecycle

```typescript
// Static factory (connects automatically)
const client = await Client.connect('localhost', 7401);

// Or manual connect
const client = new Client(config);
await client.connect(); // Connect to server

await client.close(); // Close connection
client.isConnected(); // Check connection status
```

### System Operations

```typescript
await client.ping(); // Ping server
const info = await client.info(); // Get server info
```

### Machine Operations

```typescript
// Create or update a state machine
await client.putMachine('order', 1, {
  states: ['created', 'paid', 'shipped'],
  initial: 'created',
  transitions: [
    { from: 'created', event: 'PAY', to: 'paid' },
    { from: 'paid', event: 'SHIP', to: 'shipped' },
  ],
});

// Get a machine definition
const machine = await client.getMachine('order', 1);

// List all machines
const list = await client.listMachines({ limit: 10 });
```

### Instance Operations

```typescript
// Create an instance
const instance = await client.createInstance('order', 1, {
  instanceId: 'order-123', // Optional custom ID
  initialCtx: { customerId: 'c-1' },
});

// Get instance state
const state = await client.getInstance('order-123');
console.log(state.state, state.ctx);

// Delete an instance
await client.deleteInstance('order-123');
```

### Event Operations

```typescript
// Apply an event
const result = await client.applyEvent('order-123', 'PAY', {
  payload: { amount: 99.99 },
  expectedState: 'created', // Optimistic concurrency
});

// Batch operations (atomic)
const batch = await client.batch(
  [
    { op: 'CREATE_INSTANCE', params: { machine: 'order', version: 1 } },
    { op: 'APPLY_EVENT', params: { instanceId: 'i-1', event: 'PAY' } },
  ],
  { mode: 'atomic' }
);
```

### Watch/Streaming

```typescript
// Watch a specific instance
const sub = await client.watchInstance('order-123');

// AsyncIterator style
for await (const event of sub) {
  console.log(`${event.fromState} -> ${event.toState}`);
  if (event.toState === 'delivered') {
    await sub.unsubscribe();
    break;
  }
}

// Event emitter style
sub.on('event', (event) => {
  console.log(`Event: ${event.event}`);
});

// Watch all instances with filters
const allSub = await client.watchAll({
  machines: ['order'],
  toStates: ['shipped', 'delivered'],
});
```

### WAL Operations

```typescript
// Read WAL entries
const entries = await client.walRead(0n, { limit: 100 });

// Snapshot an instance
await client.snapshotInstance('order-123');

// Trigger compaction
await client.compact();
```

## Error Handling

```typescript
import {
  Client,
  RstmdbError,
  NotFoundError,
  ConflictError,
  InvalidTransitionError,
  AuthenticationError,
  ConnectionError,
  TimeoutError,
} from '@rstmdb/client';

try {
  await client.applyEvent('order-123', 'PAY', {
    expectedState: 'created',
  });
} catch (error) {
  if (error instanceof ConflictError) {
    // State changed since we last checked
    console.log('Expected:', error.details?.expectedState);
    console.log('Actual:', error.details?.actualState);
  } else if (error instanceof InvalidTransitionError) {
    // No valid transition from current state
    console.log('Cannot apply PAY from current state');
  } else if (error instanceof NotFoundError) {
    // Instance doesn't exist
    console.log('Instance not found');
  } else if (error.retryable) {
    // Transient error, can retry
    console.log('Retrying...');
  } else {
    throw error;
  }
}
```

### Error Classes

| Class                    | Description               |
| ------------------------ | ------------------------- |
| `RstmdbError`            | Base error class          |
| `ConnectionError`        | Connection failures       |
| `TimeoutError`           | Request timeouts          |
| `ProtocolError`          | Protocol-level errors     |
| `ServerError`            | Server-returned errors    |
| `NotFoundError`          | Resource not found        |
| `ConflictError`          | Version/state conflicts   |
| `AuthenticationError`    | Auth failures             |
| `InvalidTransitionError` | Invalid state transitions |
| `GuardFailedError`       | Guard conditions failed   |

## Events

```typescript
client.on('connect', () => {
  console.log('Connected');
});

client.on('disconnect', (error) => {
  console.log('Disconnected:', error?.message);
});

client.on('reconnect', (attempt) => {
  console.log(`Reconnecting (attempt ${attempt})`);
});

client.on('error', (error) => {
  console.error('Error:', error);
});
```

## TypeScript

Full TypeScript support with comprehensive type definitions:

```typescript
import {
  // Client
  Client,
  ClientOptions,
  ClientConfig,
  TlsConfig,

  // Machine types
  MachineDefinition,
  Transition,
  PutMachineResult,
  GetMachineResult,

  // Instance types
  CreateInstanceResult,
  GetInstanceResult,

  // Event types
  ApplyEventResult,
  BatchOperation,
  BatchResult,

  // Streaming
  StreamEvent,
  Subscription,

  // Server info
  ServerInfo,

  // Errors
  RstmdbError,
  NotFoundError,
  ConflictError,
  InvalidTransitionError,
} from '@rstmdb/client';
```

## License

MIT
