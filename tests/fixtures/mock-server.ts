import * as net from 'net';
import * as tls from 'tls';
import { FrameEncoder, FrameDecoder, type Frame } from '../../src/protocol/frame.js';
import type { RequestMessage, ResponseMessage } from '../../src/protocol/messages.js';
import { Operation } from '../../src/protocol/operations.js';

export interface MockServerOptions {
  port?: number;
  tls?: {
    key: string | Buffer;
    cert: string | Buffer;
  };
}

export interface RequestMatcher {
  op: Operation;
  params?: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

/**
 * Mock rstmdb server for testing.
 */
export class MockServer {
  private server: net.Server | tls.Server;
  private connections: Set<net.Socket> = new Set();
  private encoder = new FrameEncoder();
  private matchers: RequestMatcher[] = [];
  private defaultResponses: Map<Operation, Record<string, unknown>> = new Map();
  private onRequest?: (request: RequestMessage) => void;

  readonly port: number;

  constructor(options: MockServerOptions = {}) {
    this.port = options.port ?? 0; // 0 = random available port

    if (options.tls) {
      this.server = tls.createServer({
        key: options.tls.key,
        cert: options.tls.cert,
      });
    } else {
      this.server = net.createServer();
    }

    this.setupDefaultResponses();
    this.server.on('connection', (socket: net.Socket) => this.handleConnection(socket));
    this.server.on('secureConnection', (socket: tls.TLSSocket) => this.handleConnection(socket));
  }

  private setupDefaultResponses(): void {
    this.defaultResponses.set(Operation.HELLO, { protocol_version: 1, wire_mode: 'binary_json' });
    this.defaultResponses.set(Operation.AUTH, {});
    this.defaultResponses.set(Operation.PING, {});
    this.defaultResponses.set(Operation.INFO, {
      server_name: 'mock-rstmdb',
      server_version: '1.0.0',
      protocol_version: 1,
      max_payload_bytes: 10485760,
      max_batch_ops: 100,
    });
  }

  private handleConnection(socket: net.Socket): void {
    this.connections.add(socket);
    const decoder = new FrameDecoder();

    socket.on('data', (data: Buffer) => {
      decoder.append(data);

      let frame: Frame | null;
      while ((frame = decoder.decode()) !== null) {
        this.handleFrame(socket, frame);
      }
    });

    socket.on('close', () => {
      this.connections.delete(socket);
    });

    socket.on('error', () => {
      this.connections.delete(socket);
    });
  }

  private handleFrame(socket: net.Socket, frame: Frame): void {
    let request: RequestMessage;
    try {
      request = JSON.parse(frame.payload.toString('utf8')) as RequestMessage;
    } catch {
      return;
    }

    if (this.onRequest) {
      this.onRequest(request);
    }

    const response = this.createResponse(request);
    const responseFrame = this.encoder.encode(response);
    socket.write(responseFrame);
  }

  private createResponse(request: RequestMessage): ResponseMessage {
    // Check matchers first
    for (const matcher of this.matchers) {
      if (matcher.op === request.op) {
        if (matcher.params) {
          const paramsMatch = Object.entries(matcher.params).every(
            ([key, value]) => request.params?.[key] === value
          );
          if (!paramsMatch) continue;
        }

        if (matcher.error) {
          return {
            id: request.id,
            type: 'response',
            status: 'error',
            error: matcher.error,
          };
        }

        return {
          id: request.id,
          type: 'response',
          status: 'ok',
          result: matcher.response,
        };
      }
    }

    // Check default responses
    const defaultResult = this.defaultResponses.get(request.op);
    if (defaultResult) {
      return {
        id: request.id,
        type: 'response',
        status: 'ok',
        result: defaultResult,
      };
    }

    // Unknown operation
    return {
      id: request.id,
      type: 'response',
      status: 'error',
      error: { code: 'NOT_IMPLEMENTED', message: `Operation ${request.op} not implemented` },
    };
  }

  /**
   * Start the server.
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => {
        const address = this.server.address();
        if (typeof address === 'object' && address) {
          (this as { port: number }).port = address.port;
          resolve(address.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
    });
  }

  /**
   * Stop the server.
   */
  async close(): Promise<void> {
    // Close all connections
    for (const conn of this.connections) {
      conn.destroy();
    }
    this.connections.clear();

    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  /**
   * Expect a specific request and respond.
   */
  expectRequest(op: Operation): {
    withParams(params: Record<string, unknown>): ReturnType<MockServer['expectRequest']>;
    respondWith(result: Record<string, unknown>): void;
    respondWithError(code: string, message: string, details?: Record<string, unknown>): void;
  } {
    const matcher: RequestMatcher = { op };
    this.matchers.push(matcher);

    return {
      withParams: (params: Record<string, unknown>) => {
        matcher.params = params;
        return this.expectRequest(op);
      },
      respondWith: (result: Record<string, unknown>) => {
        matcher.response = result;
      },
      respondWithError: (code: string, message: string, details?: Record<string, unknown>) => {
        matcher.error = { code, message, details };
      },
    };
  }

  /**
   * Set default response for an operation.
   */
  setDefaultResponse(op: Operation, result: Record<string, unknown>): void {
    this.defaultResponses.set(op, result);
  }

  /**
   * Clear all matchers.
   */
  clearMatchers(): void {
    this.matchers = [];
  }

  /**
   * Set request callback.
   */
  onRequestReceived(callback: (request: RequestMessage) => void): void {
    this.onRequest = callback;
  }
}
