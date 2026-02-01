/**
 * TLS configuration options for secure connections.
 */
export interface TlsConfig {
  /** CA certificate(s) for server verification */
  ca?: string | Buffer | string[];

  /** Whether to reject unauthorized certificates. Default: true */
  rejectUnauthorized?: boolean;

  /** Client certificate for mTLS */
  cert?: string | Buffer;

  /** Client private key for mTLS */
  key?: string | Buffer;

  /** Server name for SNI */
  servername?: string;
}

/**
 * Client configuration options.
 */
export interface ClientConfig {
  /** Server hostname */
  host: string;

  /** Server port. Default: 7401 */
  port?: number;

  /** Connection timeout in milliseconds. Default: 10000 */
  connectTimeout?: number;

  /** Request timeout in milliseconds. Default: 30000 */
  requestTimeout?: number;

  /** Bearer token for authentication */
  authToken?: string;

  /** TLS configuration. true = use TLS with system CA */
  tls?: TlsConfig | boolean;

  /** Enable automatic reconnection. Default: true */
  reconnect?: boolean;

  /** Reconnection interval in milliseconds. Default: 1000 */
  reconnectInterval?: number;

  /** Maximum reconnection attempts. Default: 10 */
  reconnectMaxAttempts?: number;

  /** Client name sent in HELLO */
  clientName?: string;
}

/**
 * Resolved configuration with all defaults applied.
 */
export interface ResolvedConfig {
  host: string;
  port: number;
  connectTimeout: number;
  requestTimeout: number;
  authToken?: string;
  tls?: TlsConfig;
  reconnect: boolean;
  reconnectInterval: number;
  reconnectMaxAttempts: number;
  clientName?: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  port: 7401,
  connectTimeout: 10000,
  requestTimeout: 30000,
  reconnect: true,
  reconnectInterval: 1000,
  reconnectMaxAttempts: 10,
} as const;

/**
 * Apply defaults to client configuration.
 */
export function resolveConfig(config: ClientConfig): ResolvedConfig {
  let tlsConfig: TlsConfig | undefined;
  if (config.tls === true) {
    tlsConfig = { rejectUnauthorized: true };
  } else if (config.tls && typeof config.tls === 'object') {
    tlsConfig = config.tls;
  }

  return {
    host: config.host,
    port: config.port ?? DEFAULT_CONFIG.port,
    connectTimeout: config.connectTimeout ?? DEFAULT_CONFIG.connectTimeout,
    requestTimeout: config.requestTimeout ?? DEFAULT_CONFIG.requestTimeout,
    authToken: config.authToken,
    tls: tlsConfig,
    reconnect: config.reconnect ?? DEFAULT_CONFIG.reconnect,
    reconnectInterval: config.reconnectInterval ?? DEFAULT_CONFIG.reconnectInterval,
    reconnectMaxAttempts: config.reconnectMaxAttempts ?? DEFAULT_CONFIG.reconnectMaxAttempts,
    clientName: config.clientName,
  };
}

/**
 * Builder for creating client configurations with a fluent API.
 *
 * @example
 * ```typescript
 * const config = ClientOptions.create('localhost')
 *   .port(7401)
 *   .auth('my-token')
 *   .tls({ rejectUnauthorized: true })
 *   .timeout({ connect: 5000, request: 15000 })
 *   .reconnect({ enabled: true, maxAttempts: 5 })
 *   .build();
 *
 * const client = new Client(config);
 * ```
 */
export class ClientOptions {
  private config: ClientConfig;

  private constructor(host: string) {
    this.config = { host };
  }

  /**
   * Create a new options builder with the given host.
   */
  static create(host: string): ClientOptions {
    return new ClientOptions(host);
  }

  /**
   * Set the server port.
   * @default 7401
   */
  port(port: number): this {
    this.config.port = port;
    return this;
  }

  /**
   * Set the authentication token.
   */
  auth(token: string): this {
    this.config.authToken = token;
    return this;
  }

  /**
   * Configure TLS settings.
   *
   * @param config - TLS configuration, or `true` to enable with system CA
   *
   * @example
   * ```typescript
   * // Enable TLS with system CA
   * options.tls(true)
   *
   * // Custom CA certificate
   * options.tls({ ca: fs.readFileSync('ca.pem') })
   *
   * // mTLS with client certificate
   * options.tls({
   *   ca: fs.readFileSync('ca.pem'),
   *   cert: fs.readFileSync('client.pem'),
   *   key: fs.readFileSync('client-key.pem'),
   * })
   * ```
   */
  tls(config: TlsConfig | boolean): this {
    this.config.tls = config;
    return this;
  }

  /**
   * Set timeout values.
   */
  timeout(options: { connect?: number; request?: number }): this {
    if (options.connect !== undefined) {
      this.config.connectTimeout = options.connect;
    }
    if (options.request !== undefined) {
      this.config.requestTimeout = options.request;
    }
    return this;
  }

  /**
   * Configure reconnection behavior.
   */
  reconnect(options: { enabled?: boolean; interval?: number; maxAttempts?: number }): this {
    if (options.enabled !== undefined) {
      this.config.reconnect = options.enabled;
    }
    if (options.interval !== undefined) {
      this.config.reconnectInterval = options.interval;
    }
    if (options.maxAttempts !== undefined) {
      this.config.reconnectMaxAttempts = options.maxAttempts;
    }
    return this;
  }

  /**
   * Set the client name (sent in HELLO handshake).
   */
  clientName(name: string): this {
    this.config.clientName = name;
    return this;
  }

  /**
   * Build the configuration object.
   */
  build(): ClientConfig {
    return { ...this.config };
  }
}
