import { describe, it, expect } from 'vitest';
import { resolveConfig, type ClientConfig } from '../../src/types/config.js';

describe('resolveConfig', () => {
  it('applies default values', () => {
    const config: ClientConfig = {
      host: 'localhost',
    };

    const resolved = resolveConfig(config);

    expect(resolved.host).toBe('localhost');
    expect(resolved.port).toBe(7401);
    expect(resolved.connectTimeout).toBe(10000);
    expect(resolved.requestTimeout).toBe(30000);
    expect(resolved.reconnect).toBe(true);
    expect(resolved.reconnectInterval).toBe(1000);
    expect(resolved.reconnectMaxAttempts).toBe(10);
    expect(resolved.tls).toBeUndefined();
    expect(resolved.authToken).toBeUndefined();
    expect(resolved.clientName).toBeUndefined();
  });

  it('preserves provided values', () => {
    const config: ClientConfig = {
      host: 'server.example.com',
      port: 8080,
      connectTimeout: 5000,
      requestTimeout: 60000,
      reconnect: false,
      reconnectInterval: 2000,
      reconnectMaxAttempts: 5,
      authToken: 'my-token',
      clientName: 'my-client',
    };

    const resolved = resolveConfig(config);

    expect(resolved.host).toBe('server.example.com');
    expect(resolved.port).toBe(8080);
    expect(resolved.connectTimeout).toBe(5000);
    expect(resolved.requestTimeout).toBe(60000);
    expect(resolved.reconnect).toBe(false);
    expect(resolved.reconnectInterval).toBe(2000);
    expect(resolved.reconnectMaxAttempts).toBe(5);
    expect(resolved.authToken).toBe('my-token');
    expect(resolved.clientName).toBe('my-client');
  });

  it('handles tls: true', () => {
    const config: ClientConfig = {
      host: 'localhost',
      tls: true,
    };

    const resolved = resolveConfig(config);

    expect(resolved.tls).toEqual({ rejectUnauthorized: true });
  });

  it('handles tls: false', () => {
    const config: ClientConfig = {
      host: 'localhost',
      tls: false,
    };

    const resolved = resolveConfig(config);

    expect(resolved.tls).toBeUndefined();
  });

  it('handles tls config object', () => {
    const config: ClientConfig = {
      host: 'localhost',
      tls: {
        ca: 'ca-cert',
        cert: 'client-cert',
        key: 'client-key',
        rejectUnauthorized: false,
        servername: 'server.local',
      },
    };

    const resolved = resolveConfig(config);

    expect(resolved.tls).toEqual({
      ca: 'ca-cert',
      cert: 'client-cert',
      key: 'client-key',
      rejectUnauthorized: false,
      servername: 'server.local',
    });
  });

  it('handles Buffer values in tls config', () => {
    const caCert = Buffer.from('ca-cert-data');
    const clientCert = Buffer.from('client-cert-data');
    const clientKey = Buffer.from('client-key-data');

    const config: ClientConfig = {
      host: 'localhost',
      tls: {
        ca: caCert,
        cert: clientCert,
        key: clientKey,
      },
    };

    const resolved = resolveConfig(config);

    expect(resolved.tls?.ca).toBe(caCert);
    expect(resolved.tls?.cert).toBe(clientCert);
    expect(resolved.tls?.key).toBe(clientKey);
  });

  it('handles array of CA certificates', () => {
    const config: ClientConfig = {
      host: 'localhost',
      tls: {
        ca: ['ca1', 'ca2', 'ca3'],
      },
    };

    const resolved = resolveConfig(config);

    expect(resolved.tls?.ca).toEqual(['ca1', 'ca2', 'ca3']);
  });
});
