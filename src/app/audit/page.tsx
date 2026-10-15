import { redirect } from 'next/navigation';

// The audit now lives at /manager/fssai-audit; this keeps the first link working.
export default function OldAuditLink() {
  redirect('/manager/fssai-audit');
}
