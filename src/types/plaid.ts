// Plaid TypeScript type definitions

// Use the actual types from react-plaid-link
export interface PlaidLinkMetadata {
  institution: {
    name: string;
    institution_id: string;
  } | null;
  account_id?: string;
  public_token?: string;
}

export interface PlaidLinkSuccessMetadata extends PlaidLinkMetadata {
  accounts: Array<{
    id: string;
    name: string;
    mask: string;
    type: string;
    subtype: string;
  }>;
  link_session_id: string;
}

export interface PlaidLinkExitMetadata extends PlaidLinkMetadata {
  link_session_id: string;
  request_id: string;
  status?: string;
}

export interface PlaidError {
  error_type: string;
  error_code: string;
  error_message: string;
  display_message: string | null;
  request_id: string;
}

export interface ConnectedInstitution {
  item_id: string;
  institution_name: string;
  created_at: string;
}

export interface SyncResult {
  institution: string;
  holdings?: number;
  success: boolean;
  error?: string;
}

export interface SyncResponse {
  success: boolean;
  results: SyncResult[];
  message: string;
}

export interface PlaidApiError {
  response?: {
    data?: {
      demo_mode?: boolean;
      instructions?: {
        step1: string;
        step2: string;
        step3: string;
        step4: string;
      };
    };
  };
}

export interface LinkTokenResponse {
  link_token: string;
}

export interface ExchangeTokenResponse {
  success: boolean;
  item_id: string;
  message: string;
}

export interface PlaidHolding {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_price?: number;
  cost_basis?: number;
}

export interface PlaidSecurity {
  security_id: string;
  ticker_symbol?: string;
  name: string;
  type?: string;
  close_price?: number;
}

export interface PlaidAccount {
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  mask?: string;
}

export interface HoldingsResponse {
  accounts: PlaidAccount[];
  holdings: PlaidHolding[];
  securities: PlaidSecurity[];
}

export interface SyncLog {
  sync_type: string;
  status: string;
  message: string;
  created_at: string;
}

export interface SyncHistoryResponse {
  logs: SyncLog[];
}