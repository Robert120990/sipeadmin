/**
 * Safe error response utility for Express routes
 * Logs detailed error and stack traces on the server for diagnostics,
 * but returns sanitized, user-friendly responses to HTTP clients in production
 * to prevent SQL injection schema leaks and infrastructure disclosures.
 */
const sendSafeError = (res, error, defaultMessage = 'Error interno del servidor', statusCode = 500) => {
    console.error(`[API Error] ${defaultMessage}:`, error?.stack || error?.message || error);
    const isDev = process.env.NODE_ENV !== 'production';
    return res.status(statusCode).json({
        message: defaultMessage,
        ...(isDev && error?.message ? { detail: error.message } : {})
    });
};

module.exports = { sendSafeError };
