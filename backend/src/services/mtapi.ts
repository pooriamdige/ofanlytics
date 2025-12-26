import axios, { AxiosInstance } from 'axios';
import { MTAPIError } from '../utils/errors';

export interface ConnectExResponse {
  session_id: string;
}

export interface AccountSummaryResponse {
  balance: number;
  equity: number;
  credit?: number;
  profit?: number;
  margin?: number;
  freeMargin?: number;
  marginLevel?: number;
  leverage?: number;
  currency?: string;
  method?: string;
  type?: string;
  isInvestor?: boolean;
}

export interface MTAPIOrder {
  ticket: number;
  orderType: string;
  symbol: string;
  lots: number;
  openPrice: number;
  closePrice?: number;
  profit: number;
  swap: number;
  commission: number;
  fee?: number;
  openTime: string;
  closeTime?: string;
  comment?: string;
  state?: string;
  dealType?: string;
  volume?: number; // Base units (e.g., 700000000 = 7 lots)
  contractSize?: number;
}

export interface OrderHistoryResponse {
  orders: MTAPIOrder[];
  internalDeals?: any[];
  internalOrders?: any[];
  action?: number;
  partialResponse?: boolean;
}

// Normalized order format for our database
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
   * Response is a plain UUID string (not JSON)
   */
  async connectEx(login: string, password: string, server: string): Promise<string> {
    try {
      const response = await this.client.get('/ConnectEx', {
        params: {
          user: login,
          password,
          server,
          connectTimeoutSeconds: 60,
          connectTimeoutClusterMemberSeconds: 20,
        },
        timeout: 30000,
        responseType: 'text', // MTAPI returns plain text UUID, not JSON
      });
      
      // Response is a plain UUID string
      if (!response.data) {
        console.error('ConnectEx: No response data', { status: response.status, headers: response.headers });
        throw new MTAPIError('Invalid response from ConnectEx: no data received');
      }
      
      // Trim whitespace and validate it looks like a UUID
      const sessionId = String(response.data).trim();
      
      if (!sessionId || sessionId.length < 30) {
        console.error('ConnectEx: Invalid session ID format:', sessionId);
        throw new MTAPIError(`Invalid response from ConnectEx: invalid session ID format. Response: ${sessionId}`);
      }
      
      return sessionId;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error('ConnectEx error:', {
          status,
          data,
          message: error.message,
          url: error.config?.url,
        });
        
        if (status === 401 || status === 403) {
          throw new MTAPIError('Invalid credentials or access denied', error);
        }
        
        throw new MTAPIError(
          `ConnectEx failed: ${error.message} (Status: ${status})`,
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
   * Get order history and normalize to our format
   * Returns normalized orders with raw MTAPI data attached
   */
  async orderHistory(
    sessionId: string,
    from: string,
    to: string = new Date().toISOString()
  ): Promise<Array<Order & { _raw?: MTAPIOrder }>> {
    try {
      const response = await this.client.get<OrderHistoryResponse>('/OrderHistory', {
        params: {
          id: sessionId,
          from,
          to,
          sort: 'CloseTime',
          ascending: true,
        },
        timeout: 60000, // 60 seconds for large datasets
      });
      
      // Ensure orders is always an array
      const mtapiOrders = response.data?.orders || [];
      if (!Array.isArray(mtapiOrders)) {
        return [];
      }
      
      // Normalize MTAPI order format to our database format
      const normalizedOrders: Array<Order & { _raw?: MTAPIOrder }> = mtapiOrders.map((mtapiOrder: MTAPIOrder) => ({
        order_id: mtapiOrder.ticket,
        symbol: mtapiOrder.symbol || '',
        type: mtapiOrder.orderType || mtapiOrder.dealType || '',
        volume: mtapiOrder.lots || 0, // Use lots field, not volume (volume is in base units)
        price_open: mtapiOrder.openPrice || 0,
        price_close: mtapiOrder.closePrice,
        profit: mtapiOrder.profit || 0,
        swap: mtapiOrder.swap || 0,
        commission: mtapiOrder.commission || 0,
        time_open: mtapiOrder.openTime,
        time_close: mtapiOrder.closeTime,
        comment: mtapiOrder.comment || '',
        _raw: mtapiOrder, // Attach original for raw_data storage
      }));
      
      return normalizedOrders;
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

