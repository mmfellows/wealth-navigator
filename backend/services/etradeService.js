const crypto = require('crypto');
const OAuth = require('oauth-1.0a');
const axios = require('axios');
const db = require('./database');
const { encrypt, decrypt } = require('./encryption');

class EtradeService {
  constructor() {
    this.baseURL = {
      sandbox: 'https://etgacb2.etrade.com/v1',
      production: 'https://api.etrade.com/v1'
    };

    this.oauth = null;
    this.accessToken = null;
    this.accessTokenSecret = null;
    this.consumerKey = null;
    this.consumerSecret = null;
    this.sandboxMode = true;
  }


  async initializeForUser(userId) {
    try {
      // Load user's ETrade keys from database
      const keys = await db.get(
        'SELECT consumer_key, consumer_secret, sandbox_mode, access_token, access_token_secret FROM etrade_keys WHERE user_id = ?',
        [userId]
      );

      if (!keys) {
        return false;
      }

      // Decrypt the keys
      try {
        this.consumerKey = decrypt(keys.consumer_key);
        this.consumerSecret = decrypt(keys.consumer_secret);
        this.sandboxMode = keys.sandbox_mode === 1;
      } catch (decryptError) {
        console.error('ETrade key decryption failed - please re-save your API keys:', decryptError.message);
        return false;
      }

      // Initialize OAuth with custom timestamp
      this.oauth = OAuth({
        consumer: {
          key: this.consumerKey,
          secret: this.consumerSecret
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
          return crypto
            .createHmac('sha1', key)
            .update(base_string)
            .digest('base64');
        },
        timestamp: () => Math.floor(Date.now() / 1000) // Current Unix timestamp
      });

      // Load access tokens if they exist
      if (keys.access_token && keys.access_token_secret) {
        this.accessToken = decrypt(keys.access_token);
        this.accessTokenSecret = decrypt(keys.access_token_secret);
      }

      return true;
    } catch (error) {
      console.error('Error initializing ETrade service:', error);
      return false;
    }
  }

  async getRequestToken() {
    try {
      const requestData = {
        url: `${this.getBaseURL()}/oauth/request_token`,
        method: 'GET'
      };

      // Add oauth_callback parameter as required by ETrade
      const oauthData = {
        oauth_callback: 'oob' // out-of-band for desktop applications
      };

      const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, null, oauthData));

      const response = await axios.get(requestData.url, {
        headers: {
          ...authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Parse the response
      const params = new URLSearchParams(response.data);
      return {
        oauth_token: params.get('oauth_token'),
        oauth_token_secret: params.get('oauth_token_secret'),
        oauth_callback_confirmed: params.get('oauth_callback_confirmed')
      };
    } catch (error) {
      console.error('Error getting request token:', error);
      throw error;
    }
  }

  async getAccessToken(requestToken, requestTokenSecret, verifier) {
    try {
      const requestData = {
        url: `${this.getBaseURL()}/oauth/access_token`,
        method: 'GET'
      };

      const token = {
        key: requestToken,
        secret: requestTokenSecret
      };

      const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, token));

      const response = await axios.get(`${requestData.url}?oauth_verifier=${verifier}`, {
        headers: {
          ...authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Parse the response
      const params = new URLSearchParams(response.data);
      this.accessToken = params.get('oauth_token');
      this.accessTokenSecret = params.get('oauth_token_secret');

      return {
        oauth_token: this.accessToken,
        oauth_token_secret: this.accessTokenSecret
      };
    } catch (error) {
      console.error('Error getting access token:', error);
      throw error;
    }
  }

  async saveAccessTokens(userId) {
    if (!this.accessToken || !this.accessTokenSecret) {
      throw new Error('No access tokens to save');
    }

    try {
      const encryptedToken = encrypt(this.accessToken);
      const encryptedSecret = encrypt(this.accessTokenSecret);

      await db.run(
        `UPDATE etrade_keys SET
         access_token = ?,
         access_token_secret = ?,
         updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [encryptedToken, encryptedSecret, userId]
      );

      return true;
    } catch (error) {
      console.error('Error saving access tokens:', error);
      throw error;
    }
  }

  async makeAuthenticatedRequest(url, method = 'GET', data = null) {
    if (!this.accessToken || !this.accessTokenSecret) {
      throw new Error('No access tokens available. Please authenticate first.');
    }

    try {
      const requestData = {
        url: `${this.getBaseURL()}${url}`,
        method: method.toUpperCase()
      };

      const token = {
        key: this.accessToken,
        secret: this.accessTokenSecret
      };

      const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, token));

      const config = {
        method: method.toLowerCase(),
        url: requestData.url,
        headers: {
          ...authHeader,
          'Content-Type': 'application/json'
        }
      };

      if (data && method.toUpperCase() !== 'GET') {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('Error making authenticated request:', error);
      throw error;
    }
  }

  async getAccountList() {
    try {
      const response = await this.makeAuthenticatedRequest('/account/list');
      return response;
    } catch (error) {
      console.error('Error getting account list:', error);
      throw error;
    }
  }

  async getAccountBalance(accountIdKey) {
    try {
      const response = await this.makeAuthenticatedRequest(`/account/${accountIdKey}/balance`);
      return response;
    } catch (error) {
      console.error('Error getting account balance:', error);
      throw error;
    }
  }

  async getPortfolioPositions(accountIdKey) {
    try {
      const response = await this.makeAuthenticatedRequest(`/account/${accountIdKey}/portfolio`);
      return response;
    } catch (error) {
      console.error('Error getting portfolio positions:', error);
      throw error;
    }
  }

  async getQuote(symbols) {
    try {
      const symbolString = Array.isArray(symbols) ? symbols.join(',') : symbols;
      const response = await this.makeAuthenticatedRequest(`/market/productlookup?company=${symbolString}&type=eq`);
      return response;
    } catch (error) {
      console.error('Error getting quote:', error);
      throw error;
    }
  }

  getBaseURL() {
    return this.sandboxMode ? this.baseURL.sandbox : this.baseURL.production;
  }

  getAuthorizationURL(requestToken) {
    return `${this.getBaseURL()}/oauth/authorize?key=${this.consumerKey}&token=${requestToken}`;
  }

  isAuthenticated() {
    return !!(this.accessToken && this.accessTokenSecret);
  }
}

module.exports = EtradeService;