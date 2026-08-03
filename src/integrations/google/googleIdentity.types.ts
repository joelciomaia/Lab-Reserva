export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

export type GoogleOAuthPrompt = '' | 'none' | 'consent' | 'select_account';

export interface GoogleTokenClientOverrideConfig {
  scope?: string;
  include_granted_scopes?: boolean;
  prompt?: GoogleOAuthPrompt;
}

export interface GoogleTokenClient {
  requestAccessToken(overrideConfig?: GoogleTokenClientOverrideConfig): void;
}

export interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  include_granted_scopes?: boolean;
  prompt?: GoogleOAuthPrompt;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
}

export interface GoogleIdentityWindow extends Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
      };
    };
  };
}
