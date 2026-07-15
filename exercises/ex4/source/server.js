const cds = require('@sap/cds');

let audit;

cds.on('served', async () => {
  try {
    audit = await cds.connect.to('audit-log');
    console.log('[audit] Audit logging connected');
  } catch (e) {
    console.warn('[audit] Audit logging not available:', e.message);
  }
});

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
        }).catch((e) => console.error('[audit] Failed to log security event:', e.message));
      }
      return originalEnd.apply(this, args);
    };
    next();
  });
});

cds.on('serving', (service) => {
  if (service.name !== 'CafeService') return;

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
});

module.exports = cds.server;
