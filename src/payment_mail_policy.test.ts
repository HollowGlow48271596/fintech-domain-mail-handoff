import test from "node:test";
import assert from "node:assert/strict";
import { decidePaymentMail } from "./payment_mail_policy";

test("block risk freezes notifications and rotates DKIM", () => {
  const decision = decidePaymentMail({
    paymentId: "pay_blocked_1",
    customerEmail: "risk@example.net",
    amountCents: 750000,
    currency: "USD",
    riskLevel: "block",
    eventType: "payment_settled"
  });

  assert.equal(decision.action, "freeze_and_escalate");
  assert.equal(decision.shouldRotateDkim, true);
  assert.match(decision.auditText, /Manual escalation required/);
});
