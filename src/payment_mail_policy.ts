import { z } from "zod";

export const paymentEventSchema = z.object({
  paymentId: z.string().min(1),
  customerEmail: z.string().email(),
  amountCents: z.number().int().positive(),
  currency: z.string().min(3).max(3),
  riskLevel: z.enum(["allow", "review", "block"]),
  eventType: z.enum(["payment_settled", "payment_refunded", "payout_failed"])
});

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export type PaymentMailDecision = {
  action: "deliver_receipt" | "queue_manual_review_notice" | "freeze_and_escalate";
  subject: string;
  auditText: string;
  shouldRotateDkim: boolean;
};

export function decidePaymentMail(event: PaymentEvent): PaymentMailDecision {
  if (event.riskLevel === "block") {
    return {
      action: "freeze_and_escalate",
      subject: `Hold payment ${event.paymentId}`,
      auditText: `Blocked ${event.eventType} for ${event.amountCents} ${event.currency}. Manual escalation required before any customer mail.`,
      shouldRotateDkim: true
    };
  }

  if (event.riskLevel === "review") {
    return {
      action: "queue_manual_review_notice",
      subject: `Review payment ${event.paymentId}`,
      auditText: `Queued review for ${event.eventType} on ${event.customerEmail}. No receipt sent until the review clears.`,
      shouldRotateDkim: false
    };
  }

  return {
    action: "deliver_receipt",
    subject: event.eventType === "payment_refunded"
      ? `Refund confirmation ${event.paymentId}`
      : `Receipt for payment ${event.paymentId}`,
    auditText: `Approved ${event.eventType} for ${event.amountCents} ${event.currency}. Receipt can be delivered to ${event.customerEmail}.`,
    shouldRotateDkim: false
  };
}
