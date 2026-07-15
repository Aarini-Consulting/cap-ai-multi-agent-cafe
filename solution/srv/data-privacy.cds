// Audit logging annotations for sensitive data access tracking.
// @cap-js/audit-logging auto-generates:
//   - SensitiveDataRead:    when @IsPotentiallySensitive fields are read
//   - PersonalDataModified: when @PersonalData fields are created/updated/deleted
//   - SecurityEvent:        when authorization checks fail (403)

using { cafe } from '../db/schema';

// ── Customer Feedback contains personal opinions ────────────────────
// Feedback comments may contain personal information and complaints
// that need audit trails for compliance and dispute resolution.

annotate cafe.CustomerFeedback with @PersonalData: {
  EntitySemantics: 'DataSubjectDetails'
} {
  comment    @PersonalData.IsPotentiallyPersonal;
  resolution @PersonalData.IsPotentiallyPersonal;
};

// ── Orders track customer transactions ──────────────────────────────

annotate cafe.Orders with @PersonalData: {
  EntitySemantics: 'DataSubjectDetails'
};
