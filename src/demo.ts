import { infrai } from "./infrai_client";
import { onboardMailDomainAndNotify } from "./mail_domain_onboarding";

async function main() {
  const domain = process.argv[2] ?? "billing.example.com";
  const customerEmail = process.argv[3] ?? "ops@example.net";

  const result = await onboardMailDomainAndNotify(infrai, {
    domain,
    payment: {
      paymentId: "pay_1001",
      customerEmail,
      amountCents: 12500,
      currency: "USD",
      riskLevel: "review",
      eventType: "payment_settled"
    }
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
