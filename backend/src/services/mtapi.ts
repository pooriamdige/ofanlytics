import axios, { AxiosInstance } from 'axios';
import { MTAPIError } from '../utils/errors';

export interface ConnectExResponse {
  session_id: string;
}

export interface AccountSummaryResponse {
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
}

export interface Order {
  order_id: number;
  symbol: string;
  type: string;
  volume: number;
  price_open: number;
  price_close?: number;
  profit: number;
  swap: number;
  commission: number;
  time_open: string;
  time_close?: string;
  comment?: string;
}

export interface OrderHistoryResponse {
  orders: Order[];
}

export class MTAPIClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: 30000, // 30 seconds default
    });
  }

  /**
   * Connect to MTAPI and get session ID
   */
  async connectEx(login: string, password: string, server: string): Promise<string> {
    try {
      const response = await this.client.get<ConnectExResponse>('/ConnectEx', {
        params: {
          user: login,
          password,
          server,
        },
        timeout: 30000,
      });
      
      if (!response.data?.session_id) {
        throw new MTAPIError('Invalid response from ConnectEx: missing session_id');
      }
      
      return response.data.session_id;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new MTAPIError(
          `ConnectEx failed: ${error.message}`,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Get account summary
   */
  async accountSummary(sessionId: string): Promise<AccountSummaryResponse> {
    try {
      const response = await this.client.get<AccountSummaryResponse>('/AccountSummary', {
        params: { id: sessionId },
        timeout: 15000,
      });
      
      if (!response.data) {
        throw new MTAPIError('Invalid response from AccountSummary');
      }
      
      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          throw new MTAPIError('Session expired or invalid', error);
        }
        throw new MTAPIError(
          `AccountSummary failed: ${error.message}`,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Get order history
   */
  async orderHistory(
    sessionId: string,
    from: string,
    to: string = new Date().toISOString()
  ): Promise<Order[]> {
    try {
      const response = await this.client.get<OrderHistoryResponse>('/OrderHistory', {
        params: {
          id: sessionId,
          from,
          to,
        },
        timeout: 60000, // 60 seconds for large datasets
      });
      
      // Ensure orders is always an array
      const orders = response.data?.orders || [];
      if (!Array.isArray(orders)) {
        return [];
      }
      
      return orders;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          throw new MTAPIError('Session expired or invalid', error);
        }
        throw new MTAPIError(
          `OrderHistory failed: ${error.message}`,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Disconnect session
   */
  async disconnect(sessionId: string): Promise<void> {
    try {
      await this.client.get('/Disconnect', {
        params: { id: sessionId },
        timeout: 10000,
      });
    } catch (error: any) {
      // Best effort - log but don't throw
      console.warn('Disconnect failed (non-critical):', error.message);
    }
  }

  /**
   * Retry wrapper with exponential backoff
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on 401/403 (session expired)
        if (error instanceof MTAPIError && error.originalError) {
          const axiosError = error.originalError as any;
          if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
            throw error;
          }
        }
        
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }
}

