import axios, { AxiosInstance } from 'axios';

export interface MT5AccountSummary {
  balance: number;
  credit: number;
  profit: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  currency: string;
  method: string;
  type: string;
  isInvestor: boolean;
}

export interface MT5Order {
  ticket: number;
  profit: number;
  swap: number;
  commission: number;
  fee: number;
  closePrice: number;
  closeTime: string;
  closeLots: number;
  closeComment: string | null;
  openPrice: number;
  openTime: string;
  lots: number;
  contractSize: number;
  expertId: number;
  placedType: string;
  orderType: string;
  dealType: string;
  symbol: string;
  comment: string;
  state: string;
  stopLoss: number;
  takeProfit: number;
  requestId: number;
  digits: number;
  profitRate: number;
  stopLimitPrice: number;
  dealInternalIn: any;
  dealInternalOut: any | null;
  orderInternal: any | null;
  partialCloseDeals: any[];
  partialFillDeals: any[];
  closeVolume: number;
  volume: number;
  expirationType: string;
  expirationTime: string;
  fillPolicy: string;
  openTimestampUTC: number;
  closeTimestampUTC: number;
}

export interface MT5OrderHistoryResponse {
  pagesCount?: number;
  pageNumber?: number;
  orders: MT5Order[];
}

export interface MT5OrderHistoryPaginationResponse {
  pagesCount: number;
  pageNumber: number;
  orders: MT5Order[];
}

export class MT5APIClient {
  private client: AxiosInstance;
  // baseURL is stored but accessed via this.client which has it
  // private baseURL: string;

  constructor(baseURL: string) {
    // Store baseURL in client instance
    this.client = axios.create({
      baseURL,
      timeout: 120000, // 120 seconds - MT5 API can be slow
    });
  }

  /**
   * Connect to MT5 API and get session hash
   * Returns UUID string (hash)
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
        timeout: 90000, // 90 seconds - MT5 connection can be slow
        responseType: 'text',
      });

      const hash = String(response.data).trim();
      if (!hash || hash.length < 30) {
        throw new Error(`Invalid hash format: ${hash}`);
      }

      return hash;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data || error.message;
        throw new Error(`ConnectEx failed: ${message} (Status: ${status})`);
      }
      throw error;
    }
  }

  /**
   * Get account summary
   */
  async accountSummary(hash: string): Promise<MT5AccountSummary> {
    try {
      const response = await this.client.get<MT5AccountSummary>('/AccountSummary', {
        params: { id: hash },
        timeout: 15000,
      });

      if (!response.data) {
        throw new Error('Invalid response from AccountSummary');
      }

      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          throw new Error('Session expired or invalid');
        }
        throw new Error(`AccountSummary failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get order history (full)
   */
  async orderHistory(
    hash: string,
    from: string,
    to: string
  ): Promise<MT5OrderHistoryResponse> {
    try {
      const response = await this.client.get<MT5OrderHistoryResponse>('/OrderHistory', {
        params: {
          id: hash,
          from,
          to,
          sort: 'OpenTime',
          ascending: true,
        },
        timeout: 60000,
      });

      return response.data || { orders: [] };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          throw new Error('Session expired or invalid');
        }
        throw new Error(`OrderHistory failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get order history with pagination
   */
  async orderHistoryPagination(
    hash: string,
    from: string,
    to: string,
    ordersPerPage: number = 2,
    pageNumber: number = 0
  ): Promise<MT5OrderHistoryPaginationResponse> {
    try {
      const response = await this.client.get<MT5OrderHistoryPaginationResponse>(
        '/OrderHistoryPagination',
        {
          params: {
            id: hash,
            from,
            to,
            ordersPerPage,
            pageNumber,
            sort: 'OpenTime',
            ascending: true,
          },
          timeout: 60000,
        }
      );

      return response.data || { pagesCount: 0, pageNumber: 0, orders: [] };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          throw new Error('Session expired or invalid');
        }
        throw new Error(`OrderHistoryPagination failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Disconnect session
   */
  async disconnect(hash: string): Promise<void> {
    try {
      await this.client.get('/Disconnect', {
        params: { id: hash },
        timeout: 10000,
      });
    } catch (error: any) {
      // Best effort - log but don't throw
      console.warn('Disconnect failed (non-critical):', error.message);
    }
  }
}

