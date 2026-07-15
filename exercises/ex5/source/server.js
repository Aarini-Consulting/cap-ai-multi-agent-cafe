const cds = require('@sap/cds');

const LOG = cds.log('agent');
const LOG_PERF = cds.log('agent.perf');

let audit;

cds.on('served', async () => {
  try {
    audit = await cds.connect.to('audit-log');
    LOG.info('Audit logging connected');
  } catch (e) {
    LOG.warn('Audit logging not available:', e.message);
  }
});

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOGGING — compliance trail
// ═══════════════════════════════════════════════════════════════════

cds.on('bootstrap', (app) => {
  app.use((req, res, next) => {
    const originalEnd = res.end;
    res.end = function (...args) {
      if (res.statusCode === 403 && audit) {
        const user = req.user?.id || cds.context?.user?.id || 'anonymous';
        const resource = req.originalUrl || req.url;
        audit.tx(async () => {
          await audit.log('SecurityEvent', {
            data: {
              user,
              action: `Access denied to "${resource}" — insufficient authorization`,
            },
          });
        }).catch((e) => LOG.error('Failed to log security event:', e.message));
      }
      return originalEnd.apply(this, args);
    };
    next();
  });
});

cds.on('serving', (service) => {
  if (service.name !== 'CafeService') return;

  // ── Audit: agent invocation ─────────────────────────────────────
  service.before('invokeAgent', (req) => {
    const user = req.user?.id || 'anonymous';
    const message = req.data?.message;
    if (audit) {
      audit.tx(async () => {
        await audit.log('SecurityEvent', {
          data: {
            user,
            action: `Agent invoked with message: "${message?.substring(0, 100)}"`,
          },
        });
      }).catch(() => {});
    }
  });

  // ── Audit: data-modifying operations ────────────────────────────
  const writeOps = ['placeOrder', 'cancelOrderItem', 'createRestockRequest',
    'fulfillRestockRequest', 'submitFeedback', 'resolveComplaint'];

  for (const op of writeOps) {
    service.before(op, (req) => {
      const user = req.user?.id || 'anonymous';
      if (audit) {
        audit.tx(async () => {
          await audit.log('SecurityEvent', {
            data: {
              user,
              action: `Agent tool executed: "${op}"`,
              data: JSON.stringify(req.data),
            },
          });
        }).catch(() => {});
      }
    });
  }

  // ── Audit: sensitive data reads ─────────────────────────────────
  const readOps = ['checkStock', 'getLowStockItems', 'getOpenComplaints',
    'getFeedbackDetails', 'getOrderSummary'];

  for (const op of readOps) {
    service.before(op, (req) => {
      const user = req.user?.id || 'anonymous';
      if (audit) {
        audit.tx(async () => {
          await audit.log('SecurityEvent', {
            data: {
              user,
              action: `Agent data access: "${op}"`,
              data: JSON.stringify(req.data),
            },
          });
        }).catch(() => {});
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // OBSERVABILITY — structured logs, timing, request tracing
  // ═══════════════════════════════════════════════════════════════════

  // ── Trace: invokeAgent request lifecycle ─────────────────────────
  service.before('invokeAgent', (req) => {
    req._startTime = performance.now();
    req._traceId = crypto.randomUUID();
    const user = req.user?.id || 'anonymous';
    LOG.info('request.start', {
      traceId: req._traceId,
      user,
      message: req.data?.message?.substring(0, 100),
    });
  });

  service.after('invokeAgent', (result, req) => {
    const duration = Math.round(performance.now() - req._startTime);
    LOG_PERF.info('request.complete', {
      traceId: req._traceId,
      user: req.user?.id || 'anonymous',
      durationMs: duration,
      responseLength: typeof result === 'string' ? result.length : 0,
    });
  });

  service.on('error', (err, req) => {
    if (req._traceId) {
      LOG.error('request.error', {
        traceId: req._traceId,
        user: req.user?.id || 'anonymous',
        error: err.message,
        code: err.code,
        durationMs: Math.round(performance.now() - req._startTime),
      });
    }
  });

  // ── Trace: individual operation timing ──────────────────────────
  const allOps = [...writeOps, ...readOps];

  for (const op of allOps) {
    service.before(op, (req) => {
      req._opStartTime = performance.now();
    });

    service.after(op, (_, req) => {
      const duration = Math.round(performance.now() - req._opStartTime);
      LOG_PERF.info('operation.complete', {
        operation: op,
        user: req.user?.id || 'anonymous',
        durationMs: duration,
      });
    });
  }
});

module.exports = cds.server;
