import * as net from 'net';
import * as tls from 'tls';
import { EventEmitter } from 'events';
import { FrameEncoder, FrameDecoder, type Frame } from './protocol/frame.js';
import { Operation } from './protocol/operations.js';
import {
  type RequestMessage,
  type ResponseMessage,
  type ServerMessage,
  isResponseMessage,
  isStreamEventMessage,
  isStreamEndMessage,
} from './protocol/messages.js';
import { SubscriptionManager } from './streaming/manager.js';
import {
  ConnectionError,
  TimeoutError,
  ProtocolError,
  ServerError,
} from './errors/classes.js';
import { ErrorCode } from './errors/codes.js';
import type { ResolvedConfig } from './types/config.js';

/**
 * Connection states.
 */
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  HANDSHAKING = 'HANDSHAKING',
  CONNECTED = 'CONNECTED',
  CLOSING = 'CLOSING',
}

/**
 * Pending request tracker.
 */
interface PendingRequest {
  id: string;
  resolve: (response: ResponseMessage) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Connection events.
 */
export interface ConnectionEvents {
  connect: () => void;
  disconnect: (error?: Error) => void;
  error: (error: Error) => void;
  reconnect: (attempt: number) => void;
}

/**
 * Manages the TCP/TLS connection to the rstmdb server.
 */
export class Connection extends EventEmitter {
  private config: ResolvedConfig;
  private socket: net.Socket | tls.TLSSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;

  private encoder: FrameEncoder;
  private decoder: FrameDecoder;

  private pending = new Map<string, PendingRequest>();
  private nextId = 1;

  private subscriptions: SubscriptionManager;

  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;

  constructor(config: ResolvedConfig, subscriptions: SubscriptionManager) {
    super();
    this.config = config;
    this.subscriptions = subscriptions;
    this.encoder = new FrameEncoder({ useCrc: true });
    this.decoder = new FrameDecoder({ verifyCrc: true });
  }

  /**
   * Get the current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Connect to the server.
   */
  async connect(): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED) {
      throw new ConnectionError('Already connected or connecting');
    }

    this.closing = false;
    this.state = ConnectionState.CONNECTING;

    try {
      await this.createSocket();
      this.state = ConnectionState.HANDSHAKING;
      await this.handshake();
      this.state = ConnectionState.CONNECTED;
      this.reconnectAttempt = 0;
      this.emit('connect');
    } catch (error) {
      this.state = ConnectionState.DISCONNECTED;
      this.cleanup();
      throw error;
    }
  }

  /**
   * Close the connection.
   */
  async close(): Promise<void> {
    this.closing = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.state = ConnectionState.CLOSING;

      // Cancel all pending requests
      const error = new ConnectionError('Connection closed');
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      this.pending.clear();

      // Close subscriptions
      this.subscriptions.closeAll(error);

      // Close socket
      await new Promise<void>((resolve) => {
        if (this.socket) {
          this.socket.once('close', () => resolve());
          this.socket.end();
          // Force close after a short delay
          setTimeout(() => {
            if (this.socket) {
              this.socket.destroy();
            }
            resolve();
          }, 1000);
        } else {
          resolve();
        }
      });

      this.cleanup();
    }

    this.state = ConnectionState.DISCONNECTED;
  }

  /**
   * Send a request and wait for response.
   */
  async request<T>(
    op: Operation,
    params?: object
  ): Promise<T> {
    // Allow requests during HANDSHAKING (for HELLO/AUTH) and CONNECTED states
    if (this.state !== ConnectionState.CONNECTED && this.state !== ConnectionState.HANDSHAKING) {
      throw new ConnectionError('Not connected');
    }

    const socket = this.socket;
    if (!socket) {
      throw new ConnectionError('Socket not available');
    }

    const id = String(this.nextId++);
    const message: RequestMessage = { type: 'request', id, op, params };
    const frame = this.encoder.encode(message);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new TimeoutError(`Request ${op} timed out after ${this.config.requestTimeout}ms`));
      }, this.config.requestTimeout);

      this.pending.set(id, {
        id,
        resolve: (response) => {
          clearTimeout(timeout);
          this.pending.delete(id);

          if (response.status !== 'ok') {
            reject(
              ServerError.fromResponse(
                response.error || { code: ErrorCode.INTERNAL_ERROR, message: 'Unknown error' }
              )
            );
          } else {
            resolve(response.result as T);
          }
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(error);
        },
        timeout,
      });

      socket.write(frame, (err) => {
        if (err) {
          const pending = this.pending.get(id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pending.delete(id);
            reject(new ConnectionError(`Failed to send request: ${err.message}`, { cause: err }));
          }
        }
      });
    });
  }

  /**
   * Create the TCP/TLS socket.
   */
  private async createSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
          this.socket = null;
        }
        reject(new TimeoutError(`Connection timeout after ${this.config.connectTimeout}ms`));
      }, this.config.connectTimeout);

      const options = {
        host: this.config.host,
        port: this.config.port,
      };

      const onConnect = () => {
        clearTimeout(connectTimeout);
        this.setupSocket();
        resolve();
      };

      const onError = (err: Error) => {
        clearTimeout(connectTimeout);
        reject(new ConnectionError(`Failed to connect: ${err.message}`, { cause: err }));
      };

      if (this.config.tls) {
        const tlsOptions: tls.ConnectionOptions = {
          ...options,
          ...this.config.tls,
        };
        this.socket = tls.connect(tlsOptions);
        this.socket.once('secureConnect', onConnect);
      } else {
        this.socket = net.connect(options);
        this.socket.once('connect', onConnect);
      }

      this.socket.once('error', onError);
    });
  }

  /**
   * Set up socket event handlers.
   */
  private setupSocket(): void {
    if (!this.socket) return;

    this.socket.on('data', (data: Buffer) => this.handleData(data));

    this.socket.on('close', () => {
      const wasConnected = this.state === ConnectionState.CONNECTED;
      this.cleanup();
      this.state = ConnectionState.DISCONNECTED;

      if (!this.closing && wasConnected) {
        this.emit('disconnect');
        this.scheduleReconnect();
      }
    });

    this.socket.on('error', (err: Error) => {
      this.emit('error', new ConnectionError(err.message, { cause: err }));
    });
  }

  /**
   * Handle incoming data.
   */
  private handleData(data: Buffer): void {
    this.decoder.append(data);

    let frame: Frame | null;
    try {
      while ((frame = this.decoder.decode()) !== null) {
        this.handleFrame(frame);
      }
    } catch (error) {
      // Protocol error - close connection
      this.emit('error', error as Error);
      this.socket?.destroy();
    }
  }

  /**
   * Handle a decoded frame.
   */
  private handleFrame(frame: Frame): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(frame.payload.toString('utf8')) as ServerMessage;
    } catch {
      throw new ProtocolError('Invalid JSON payload');
    }

    if (isResponseMessage(message)) {
      const pending = this.pending.get(message.id);
      if (pending) {
        pending.resolve(message);
      }
    } else if (isStreamEventMessage(message)) {
      this.subscriptions.dispatch(message);
    } else if (isStreamEndMessage(message)) {
      this.subscriptions.end(message.subscription_id);
    }
  }

  /**
   * Perform the handshake (HELLO + AUTH).
   */
  private async handshake(): Promise<void> {
    // Send HELLO with RCP protocol parameters
    const helloParams: Record<string, unknown> = {
      protocol_version: 1,
      wire_modes: ['binary_json'],
      features: ['idempotency', 'batch'],
    };
    if (this.config.clientName) {
      helloParams['client_name'] = this.config.clientName;
    }

    const helloResult = await this.request<{ protocol_version: number; wire_mode: string }>(
      Operation.HELLO,
      helloParams
    );

    // Verify protocol version
    if (helloResult.protocol_version !== 1) {
      throw new ProtocolError(
        `Unsupported protocol version: ${helloResult.protocol_version}`,
        ErrorCode.UNSUPPORTED_PROTOCOL
      );
    }

    // Send AUTH if token provided
    if (this.config.authToken) {
      await this.request(Operation.AUTH, {
        method: 'bearer',
        token: this.config.authToken,
      });
    }
  }

  /**
   * Schedule a reconnection attempt.
   */
  private scheduleReconnect(): void {
    if (this.closing || !this.config.reconnect) {
      return;
    }

    if (this.reconnectAttempt >= this.config.reconnectMaxAttempts) {
      this.emit(
        'error',
        new ConnectionError(`Max reconnection attempts (${this.config.reconnectMaxAttempts}) reached`)
      );
      return;
    }

    this.reconnectAttempt++;
    const delay = this.config.reconnectInterval * Math.min(this.reconnectAttempt, 5);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.emit('reconnect', this.reconnectAttempt);

      this.connect().catch(() => {
        // Will trigger another reconnect via the close handler
      });
    }, delay);
  }

  /**
   * Clean up resources.
   */
  private cleanup(): void {
    this.decoder.reset();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket = null;
    }
  }
}
