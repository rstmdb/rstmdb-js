/**
 * TLS connection example for @rstmdb/client
 *
 * Demonstrates: TLS and mTLS (mutual TLS) configuration using the ClientOptions builder
 */

import * as fs from 'fs';
import * as path from 'path';
import { Client, ClientOptions } from '@rstmdb/client';

async function main() {
  // Example 1: Simple TLS with system CA using builder
  console.log('--- Example 1: Simple TLS ---');
  {
    const config = ClientOptions.create('rstmdb.example.com')
      .port(7401)
      .tls(true) // Uses system CA bundle
      .build();

    const client = new Client(config);

    // In production, you would:
    // await client.connect();
    console.log('Configured client with system CA TLS');
  }

  // Example 2: TLS with custom CA certificate
  console.log('\n--- Example 2: Custom CA Certificate ---');
  {
    const config = ClientOptions.create('rstmdb.internal')
      .port(7401)
      .tls({
        ca: fs.readFileSync(path.join(__dirname, 'certs/ca.pem')),
        rejectUnauthorized: true,
      })
      .build();

    const client = new Client(config);
    console.log('Configured client with custom CA certificate');
  }

  // Example 3: Multiple CA certificates
  console.log('\n--- Example 3: Multiple CA Certificates ---');
  {
    const config = ClientOptions.create('rstmdb.internal')
      .port(7401)
      .tls({
        // Multiple CA certificates (e.g., for CA rotation)
        ca: [
          fs.readFileSync(path.join(__dirname, 'certs/ca-old.pem')).toString(),
          fs.readFileSync(path.join(__dirname, 'certs/ca-new.pem')).toString(),
        ],
      })
      .build();

    const client = new Client(config);
    console.log('Configured client with multiple CA certificates');
  }

  // Example 4: Mutual TLS (mTLS)
  console.log('\n--- Example 4: Mutual TLS (mTLS) ---');
  {
    const config = ClientOptions.create('rstmdb.secure.internal')
      .port(7401)
      .tls({
        // Server verification
        ca: fs.readFileSync(path.join(__dirname, 'certs/ca.pem')),
        rejectUnauthorized: true,
        // Client certificate for mutual auth
        cert: fs.readFileSync(path.join(__dirname, 'certs/client.pem')),
        key: fs.readFileSync(path.join(__dirname, 'certs/client-key.pem')),
      })
      .build();

    const client = new Client(config);
    console.log('Configured client with mTLS');
  }

  // Example 5: TLS with SNI (Server Name Indication)
  console.log('\n--- Example 5: TLS with SNI ---');
  {
    const config = ClientOptions.create('10.0.0.100') // Connecting by IP
      .port(7401)
      .tls({
        servername: 'rstmdb.example.com', // SNI for virtual hosting
        ca: fs.readFileSync(path.join(__dirname, 'certs/ca.pem')),
      })
      .build();

    const client = new Client(config);
    console.log('Configured client with SNI');
  }

  // Example 6: Development mode (insecure, not for production!)
  console.log('\n--- Example 6: Development Mode (Insecure) ---');
  {
    const config = ClientOptions.create('localhost')
      .port(7401)
      .tls({
        // WARNING: Only use this in development!
        rejectUnauthorized: false,
      })
      .build();

    const client = new Client(config);
    console.log('Configured client with insecure TLS (development only!)');
  }

  // Example 7: Full configuration with TLS, auth, and timeouts
  console.log('\n--- Example 7: Full Configuration ---');
  {
    const config = ClientOptions.create('rstmdb.example.com')
      .port(7401)
      .tls({
        ca: fs.readFileSync(path.join(__dirname, 'certs/ca.pem')),
      })
      .auth(process.env['RSTMDB_TOKEN'] || 'your-auth-token')
      .timeout({ connect: 5000, request: 30000 })
      .reconnect({ enabled: true, interval: 2000, maxAttempts: 10 })
      .clientName('my-service')
      .build();

    const client = new Client(config);
    console.log('Configured client with full options');

    // Connection events
    client.on('connect', () => {
      console.log('Connected securely');
    });

    client.on('error', (error) => {
      console.error('Connection error:', error.message);
    });

    // In production:
    // await client.connect();
    // await client.ping();
    // await client.close();
  }
}

main().catch(console.error);
