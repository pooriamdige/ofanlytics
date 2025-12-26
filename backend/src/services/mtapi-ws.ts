import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface OrderProfitEvent {
  order_id: number;
  profit: number;
  account_id?: number;
  session_id?: string;
  login?: string;
  server?: string;
}

export interface EquityUpdateEvent {
  equity: number;
  account_id?: number;
  session_id?: string;
  login?: string;
  server?: string;
}

export class MTAPIWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 60000;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isConnected = false;

  constructor(url: string) {
    super();
    this.url = url;
  }

  /**
   * Connect to WebSocket
   * Note: sessionId is not used in URL for shared connections
   * Instead, it's sent in subscribe messages
   */
  async connect(sessionId?: string): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        // Connect to base URL (session_id will be sent in subscribe messages)
        // This allows one connection to handle multiple accounts with different session_ids
        const wsUrl = this.url;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startPingInterval();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          if (!this.isConnected) {
            reject(error);
          }
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          this.isConnecting = false;
          this.stopPingInterval();
          this.emit('disconnected');
          this.attemptReconnect(sessionId);
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Subscribe to account events
   */
  subscribe(login: string, server: string, sessionId?: string): void {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      action: 'subscribe',
      login,
      server,
      session_id: sessionId,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Unsubscribe from account events
   */
  unsubscribe(login: string, server: string, sessionId?: string): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    const message = {
      action: 'unsubscribe',
      login,
      server,
      session_id: sessionId,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: any): void {
    if (message.type === 'OnOrderProfit') {
      this.emit('orderProfit', message as OrderProfitEvent);
    } else if (message.type === 'EquityUpdate') {
      this.emit('equityUpdate', message as EquityUpdateEvent);
    } else {
      this.emit('message', message);
    }
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.ping();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   * Note: sessionId parameter kept for compatibility but not used in URL
   */
  private async attemptReconnect(sessionId?: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('reconnectFailed');
      return;
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(async () => {
      try {
        // Don't pass sessionId to connect (it's sent in subscribe messages)
        await this.connect();
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }, delay);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

