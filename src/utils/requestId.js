/**
 * Request ID Utility
 * Utilities for propagating request IDs to external service calls
 */

/**
 * Adds X-Request-ID header to external service request options
 * @param {Object} options - Request options (axios, fetch, etc.)
 * @param {string} requestId - The request ID to propagate
 * @returns {Object} Updated options with request ID header
 */
export const addRequestIdToHeaders = (options, requestId) => {
  if (!requestId) return options;

  const updatedOptions = { ...options };

  // Ensure headers object exists
  updatedOptions.headers = {
    ...updatedOptions.headers,
    'X-Request-ID': requestId,
  };

  return updatedOptions;
};

/**
 * Extracts request ID from current request context
 * @param {Object} req - Express request object
 * @returns {string} Request ID or null if not found
 */
export const getRequestIdFromRequest = req => {
  return (
    req?.requestId ||
    req?.correlationId ||
    req?.headers?.['x-request-id'] ||
    req?.headers?.['x-correlation-id']
  );
};

/**
 * Enhanced fetch wrapper that automatically propagates request ID
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {string} requestId - Request ID to propagate
 * @returns {Promise} Fetch promise
 */
export const fetchWithRequestId = async (url, options = {}, requestId) => {
  const enhancedOptions = addRequestIdToHeaders(options, requestId);

  // Log the external call with request ID
  if (requestId) {
    console.log(`[${requestId}] Making external call to ${url}`);
  }

  return fetch(url, enhancedOptions);
};

/**
 * Axios interceptor utility for automatic request ID propagation
 * @param {Object} axiosInstance - Axios instance
 * @param {Function} requestIdProvider - Function to get current request ID
 */
export const setupAxiosRequestIdInterceptor = (axiosInstance, requestIdProvider) => {
  // Request interceptor - add request ID
  axiosInstance.interceptors.request.use(
    config => {
      const requestId = requestIdProvider();
      if (requestId) {
        config.headers = config.headers || {};
        config.headers['X-Request-ID'] = requestId;

        // Log the external call
        console.log(`[${requestId}] Making axios call to ${config.url}`);
      }
      return config;
    },
    error => {
      return Promise.reject(error);
    }
  );

  // Response interceptor - log response
  axiosInstance.interceptors.response.use(
    response => {
      const requestId = response.config.headers['X-Request-ID'];
      if (requestId) {
        console.log(
          `[${requestId}] Received response from ${response.config.url} - Status: ${response.status}`
        );
      }
      return response;
    },
    error => {
      const requestId = error.config?.headers?.['X-Request-ID'];
      if (requestId) {
        console.error(
          `[${requestId}] External call failed to ${error.config?.url}:`,
          error.message
        );
      }
      return Promise.reject(error);
    }
  );
};

/**
 * Middleware factory to provide request ID to external service calls
 * @param {Object} req - Express request object
 * @returns {Function} Function that returns current request ID
 */
export const createRequestIdProvider = req => {
  return () => getRequestIdFromRequest(req);
};
