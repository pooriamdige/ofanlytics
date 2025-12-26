import { MTAPIWebSocketClient, OrderProfitEvent, EquityUpdateEvent } from '../services/mtapi-ws';
import { db } from '../database/connection';
import { EventEmitter } from 'events';

interface AccountSubscription {
  accountId: number;
  login: string;
  server: string;
  sessionId?: string;
}

export class WebSocketManager extends EventEmitter {
  private subscriptions: Map<number, AccountSubscription> = new Map();
  private eventsUrl: string;
  private sharedWsClient: MTAPIWebSocketClient | null = null;
  private connectionPromise: Promise<void> | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(eventsUrl: string) {
    super();
    this.eventsUrl = eventsUrl;
  }

  /**
   * Get or create shared WebSocket connection
   */
  private async getSharedConnection(): Promise<MTAPIWebSocketClient> {
    if (this.sharedWsClient && this.sharedWsClient.connected) {
      return this.sharedWsClient;
    }

    if (this.connectionPromise) {
      await this.connectionPromise;
      if (this.sharedWsClient) {
        return this.sharedWsClient;
      }
    }

    this.connectionPromise = (async () => {
      try {
        this.sharedWsClient = new MTAPIWebSocketClient(this.eventsUrl);
        
        // Set up shared event handlers
        this.sharedWsClient.on('connected', () => {
          console.log('Shared WebSocket connected');
          // Resubscribe all accounts after reconnection
          this.resubscribeAll();
        });

        this.sharedWsClient.on('orderProfit', (event: OrderProfitEvent) => {
          this.routeEvent('orderProfit', event);
        });

        this.sharedWsClient.on('equityUpdate', (event: EquityUpdateEvent) => {
          this.routeEvent('equityUpdate', event);
        });

        this.sharedWsClient.on('error', (error: Error) => {
          console.error('Shared WebSocket error:', error);
          this.emit('error', { accountId: null, error });
        });

        this.sharedWsClient.on('disconnected', () => {
          console.log('Shared WebSocket disconnected');
          this.sharedWsClient = null;
          this.connectionPromise = null;
          
          // Clear reconnect timeout if exists
          if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
          }
          
          // Attempt to reconnect if we have active subscriptions
          if (this.subscriptions.size > 0) {
            this.reconnectTimeout = setTimeout(() => {
              this.getSharedConnection().catch(err => {
                console.error('Failed to reconnect shared WebSocket:', err);
              });
            }, 5000);
          }
        });

        // Connect without session_id in URL (we'll use it in subscribe messages)
        await this.sharedWsClient.connect();
      } catch (error) {
        console.error('Failed to create shared WebSocket connection:', error);
        this.sharedWsClient = null;
        this.connectionPromise = null;
        throw error;
      }
    })();

    await this.connectionPromise;
    if (!this.sharedWsClient) {
      throw new Error('Failed to establish shared WebSocket connection');
    }
    return this.sharedWsClient;
  }

  /**
   * Route events to correct account based on login/server/session_id
   */
  private routeEvent(eventType: string, event: any): void {
    // Try to find account by session_id first (most reliable)
    if (event.session_id) {
      for (const [accountId, subscription] of this.subscriptions) {
        if (subscription.sessionId === event.session_id) {
          this.emit(eventType, { accountId, ...event });
          return;
        }
      }
    }

    // Try to find by login and server
    if (event.login && event.server) {
      for (const [accountId, subscription] of this.subscriptions) {
        if (subscription.login === event.login && subscription.server === event.server) {
          this.emit(eventType, { accountId, ...event });
          return;
        }
      }
    }

    // Try to find by account_id in event (if Events service provides it)
    if (event.account_id) {
      const accountId = event.account_id;
      if (this.subscriptions.has(accountId)) {
        this.emit(eventType, { accountId, ...event });
        return;
      }
    }

    // If we can't route, emit to all handlers (fallback)
    console.warn(`Could not route ${eventType} event to specific account:`, event);
    this.emit(eventType, { accountId: null, ...event });
  }

  /**
   * Resubscribe all accounts after reconnection
   */
  private async resubscribeAll(): Promise<void> {
    const subscriptions = Array.from(this.subscriptions.values());
    console.log(`Resubscribing ${subscriptions.length} accounts after reconnection...`);

    for (const sub of subscriptions) {
      try {
        await this.subscribeInternal(sub.accountId, sub.login, sub.server, sub.sessionId);
      } catch (error) {
        console.error(`Failed to resubscribe account ${sub.accountId}:`, error);
      }
    }
  }

  /**
   * Internal subscribe method (assumes connection is ready)
   */
  private async subscribeInternal(accountId: number, login: string, server: string, sessionId?: string): Promise<void> {
    const wsClient = await this.getSharedConnection();
    
    // Send subscribe message
    wsClient.subscribe(login, server, sessionId);
    
    // Update account with ws_connection_id
    await db('accounts')
      .where({ id: accountId })
      .update({
        ws_connection_id: `ws_shared_${Date.now()}`,
        ws_subscribed_at: new Date(),
      });

    console.log(`Subscribed account ${accountId} (login: ${login}, server: ${server}) to shared WebSocket`);
  }

  /**
   * Subscribe to account events (uses shared connection)
   */
  async subscribe(accountId: number, login: string, server: string, sessionId?: string): Promise<void> {
    if (this.subscriptions.has(accountId)) {
      console.log(`Account ${accountId} already subscribed`);
      return;
    }

    // Store subscription info
    this.subscriptions.set(accountId, {
      accountId,
      login,
      server,
      sessionId,
    });

    try {
      // Get shared connection and subscribe
      await this.subscribeInternal(accountId, login, server, sessionId);
    } catch (error) {
      // Remove from subscriptions if subscribe failed
      this.subscriptions.delete(accountId);
      throw error;
    }
  }

  /**
   * Unsubscribe from account events
   */
  async unsubscribe(accountId: number): Promise<void> {
    const subscription = this.subscriptions.get(accountId);
    if (!subscription) {
      return;
    }

    if (this.sharedWsClient && this.sharedWsClient.connected) {
      try {
        this.sharedWsClient.unsubscribe(subscription.login, subscription.server, subscription.sessionId);
      } catch (error) {
        console.error(`Failed to send unsubscribe for account ${accountId}:`, error);
      }
    }

    this.subscriptions.delete(accountId);

    // Clear ws_connection_id
    await db('accounts')
      .where({ id: accountId })
      .update({
        ws_connection_id: null,
        ws_subscribed_at: null,
      });

    console.log(`Unsubscribed account ${accountId} from shared WebSocket`);

    // If no more subscriptions, disconnect shared connection
    if (this.subscriptions.size === 0 && this.sharedWsClient) {
      console.log('No more subscriptions, disconnecting shared WebSocket');
      this.sharedWsClient.disconnect();
      this.sharedWsClient = null;
      this.connectionPromise = null;
    }
  }

  /**
   * Check if account is subscribed
   */
  isSubscribed(accountId: number): boolean {
    return this.subscriptions.has(accountId);
  }

  /**
   * Get all subscribed account IDs
   */
  getSubscribedAccounts(): number[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Disconnect all
   */
  disconnectAll(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.sharedWsClient) {
      this.sharedWsClient.disconnect();
      this.sharedWsClient = null;
    }

    this.connectionPromise = null;
    this.subscriptions.clear();
  }
}

