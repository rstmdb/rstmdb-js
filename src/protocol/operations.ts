/**
 * RCP operation types.
 */
export enum Operation {
  // System operations
  HELLO = 'HELLO',
  AUTH = 'AUTH',
  PING = 'PING',
  INFO = 'INFO',

  // Machine operations
  PUT_MACHINE = 'PUT_MACHINE',
  GET_MACHINE = 'GET_MACHINE',
  LIST_MACHINES = 'LIST_MACHINES',

  // Instance operations
  CREATE_INSTANCE = 'CREATE_INSTANCE',
  GET_INSTANCE = 'GET_INSTANCE',
  DELETE_INSTANCE = 'DELETE_INSTANCE',

  // Event operations
  APPLY_EVENT = 'APPLY_EVENT',
  BATCH = 'BATCH',

  // WAL operations
  WAL_READ = 'WAL_READ',
  SNAPSHOT_INSTANCE = 'SNAPSHOT_INSTANCE',
  COMPACT = 'COMPACT',

  // Watch operations
  WATCH_INSTANCE = 'WATCH_INSTANCE',
  WATCH_ALL = 'WATCH_ALL',
  UNWATCH = 'UNWATCH',
}

/**
 * All supported operations.
 */
export const OPERATIONS = Object.values(Operation);

/**
 * Check if a string is a valid operation.
 */
export function isValidOperation(op: string): op is Operation {
  return OPERATIONS.includes(op as Operation);
}
