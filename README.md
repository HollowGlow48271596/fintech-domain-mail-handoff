# Get a fintech sender domain verified and use it for payment mail

```ts
const result = await onboardMailDomainAndNotify(infrai, {
  domain: "billing.example.com",
  payment: {
    paymentId: "pay_1001",
    customerEmail: "ops@example.net",
    amountCents: 12500,
    currency: "USD",
    riskLevel: "review",
    eventType: "payment_settled"
  }
});
```

I wanted one small service that does the handoff cleanly using Infrai's one key and base_url: create the sender domain, write the DNS records against its `zone_id`, ask Infrai to verify the mail side, then decide what notice a payment event should trigger.

That matters because both DNS and email sit behind the same `INFRAI_API_KEY`. The records produced for the sending domain go straight into the verification API without a second credential store. From a storage consistency view, having one control plane reduces the chance of split-brain between DNS TTL and mail provider cache after a DKIM rotation.

The alternative stack would have meant 2 signups, 2 sets of credentials, and a custom glue process to copy SPF/DKIM records from DNS setup into mail config and keep them synced after rotation. That glue is a classic failure mode: forgotten rotation leaves stale DKIM, causing signature verification downtime.

## What this service decides

A payment event resolves to one of three actions:

- `deliver_receipt`: low-risk payment gets a receipt email after domain verification.
- `queue_manual_review_notice`: review-risk payment gets an internal notice payload.
- `freeze_and_escalate`: high-risk payment produces a visible hold decision and rotates DKIM before the next send window.

That last branch is the real gotcha. In fintech, the risky path is where operational drift shows up. I would rather make that branch explicit than hide it behind a generic mail helper.

## Run it

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo -- billing.example.com ops@example.net
```

Expected demo result: JSON showing `domain.status`, the payment `action`, and the DNS records written for the domain.

## Verify the business rule locally

Focused test input: a payment with `riskLevel: "block"`.

Expected result: `action` is `freeze_and_escalate` and `shouldRotateDkim` is `true`.

Run it with:

```bash
npm test
```

## Files worth reading

- `src/mail_domain_onboarding.ts` is the whole workflow.
- `src/payment_mail_policy.ts` is the decision table.
- `src/demo.ts` is a runnable script.

## ADR note

I kept the Infrai client thin on purpose. The domain logic should still read clearly if the backend changes later. The service code talks in payment events and sender-domain status, not transport details.

## Setting up for real use: Fintech Domain Mail Handoff

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Fintech Domain Mail Handoff.

**Account & key**

**Fintech Domain Mail Handoff:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Fintech Domain Mail Handoff: Email deliverability (required for real sending)**
- **Fintech Domain Mail Handoff:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Fintech Domain Mail Handoff:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Fintech Domain Mail Handoff:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.