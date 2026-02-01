/**
 * A state machine transition definition.
 */
export interface Transition {
  /** Source state(s) */
  from: string | string[];

  /** Event that triggers the transition */
  event: string;

  /** Target state */
  to: string;

  /** Optional guard expression */
  guard?: string;
}

/**
 * A state machine definition.
 */
export interface MachineDefinition {
  /** List of valid states */
  states: string[];

  /** Initial state for new instances */
  initial: string;

  /** Transition definitions */
  transitions: Transition[];

  /** Optional metadata */
  meta?: Record<string, unknown>;
}

/**
 * Result of PUT_MACHINE operation.
 */
export interface PutMachineResult {
  /** Machine name */
  machine: string;

  /** Machine version */
  version: number;

  /** Checksum of stored definition */
  storedChecksum: string;

  /** Whether the machine was newly created */
  created: boolean;
}

/**
 * Result of GET_MACHINE operation.
 */
export interface GetMachineResult {
  /** Machine definition */
  definition: MachineDefinition;

  /** Definition checksum */
  checksum: string;
}

/**
 * A machine entry in LIST_MACHINES result.
 */
export interface MachineListItem {
  /** Machine name */
  machine: string;

  /** Available versions */
  versions: number[];
}

/**
 * Options for LIST_MACHINES operation.
 */
export interface ListMachinesOptions {
  /** Pagination cursor */
  cursor?: string;

  /** Maximum items to return */
  limit?: number;
}

/**
 * Result of LIST_MACHINES operation.
 */
export interface ListMachinesResult {
  /** List of machines */
  items: MachineListItem[];

  /** Cursor for next page, if more results exist */
  nextCursor?: string;
}
