let csrfToken;
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export async function api(url, options = {}) {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers);
  if (method !== 'GET') {
    if (!csrfToken) {
      const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
      if (!tokenResponse.ok)
        throw new ApiError(
          'Could not prepare the form. Please refresh and try again.',
          tokenResponse.status,
          {},
        );
      csrfToken = (await tokenResponse.json()).data.csrfToken;
    }
    headers.set('X-CSRF-Token', csrfToken);
  }
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(`/api${url}`, {
    ...options,
    method,
    headers,
    body,
    credentials: 'same-origin',
  });
  if (response.status === 204) {
    if (url === '/auth/logout') csrfToken = undefined;
    return {};
  }
  const data = await response.json().catch(() => ({
    error: {
      message:
        response.status === 413
          ? 'Your image is too large. Choose a file under 5 MiB.'
          : 'The shop is temporarily unavailable. Please try again.',
    },
  }));
  if (!response.ok) {
    if (data.error?.code === 'CSRF_INVALID') csrfToken = undefined;
    if (response.status === 401 && !url.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(
      data.error?.message || 'Please try again.',
      response.status,
      data.error || {},
    );
  }
  if (data.data?.csrfToken) csrfToken = data.data.csrfToken;
  return data;
}
export const money = (minor, currency = 'THB') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
  }).format(minor / 100);
export const dateLabel = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
