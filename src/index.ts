// Main client
export { Client, type ClientEvents } from './client.js';

// Configuration types and builder
export {
  ClientOptions,
  DEFAULT_CONFIG,
  type ClientConfig,
  type TlsConfig,
  type ResolvedConfig,
} from './types/config.js';

// Machine types
export {
  type MachineDefinition,
  type Transition,
  type PutMachineResult,
  type GetMachineResult,
  type MachineListItem,
  type ListMachinesOptions,
  type ListMachinesResult,
} from './types/machine.js';

// Instance types
export {
  type CreateInstanceOptions,
  type CreateInstanceResult,
  type GetInstanceResult,
  type DeleteInstanceOptions,
} from './types/instance.js';

// Operation result types
export {
  type ApplyEventOptions,
  type ApplyEventResult,
  type BatchOperation,
  type BatchOptions,
  type BatchResult,
  type BatchResultItem,
  type ServerInfo,
  type WalReadOptions,
  type WalEntry,
  type WalReadResult,
  type SnapshotResult,
  type CompactOptions,
  type CompactResult,
} from './types/results.js';

// Streaming types
export {
  type Subscription,
  type StreamEvent,
  type WatchOptions,
  type WatchAllOptions,
} from './streaming/subscription.js';

// Error types
export { ErrorCode } from './errors/codes.js';
export { RstmdbError } from './errors/base.js';
export {
  ConnectionError,
  TimeoutError,
  ProtocolError,
  ServerError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  InvalidTransitionError,
  GuardFailedError,
} from './errors/classes.js';

// Protocol exports (for advanced use)
export {
  FRAME_MAGIC,
  PROTOCOL_VERSION,
  HEADER_SIZE,
  FrameFlags,
  FrameEncoder,
  FrameDecoder,
  type Frame,
} from './protocol/frame.js';
export { Operation } from './protocol/operations.js';
