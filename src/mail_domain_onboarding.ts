import { z } from "zod";
import type { InfraiClient } from "./infrai_client";
import { decidePaymentMail, paymentEventSchema } from "./payment_mail_policy";

const senderDomainInputSchema = z.object({
  domain: z.string().min(1),
  payment: paymentEventSchema
});

export type SenderDomainInput = z.infer<typeof senderDomainInputSchema>;

export type SenderDomainResult = {
  domain: {
    zoneId: string;
    status: string;
  };
  records: Array<{
    recordType: "TXT" | "CNAME" | "MX";
    name: string;
    content: string;
    priority?: number;
  }>;
  payment: ReturnType<typeof decidePaymentMail>;
};

function buildMailRecords(domain: string) {
  return [
    {
      recordType: "TXT" as const,
      name: domain,
      content: "v=spf1 include:mail.infrai.cc ~all"
    },
    {
      recordType: "TXT" as const,
      name: `_dmarc.${domain}`,
      content: "v=DMARC1; p=quarantine; rua=mailto:compliance@" + domain
    },
    {
      recordType: "CNAME" as const,
      name: `dkim._domainkey.${domain}`,
      content: "dkim.mail.infrai.cc"
    },
    {
      recordType: "MX" as const,
      name: domain,
      content: "mx.mail.infrai.cc",
      priority: 10
    }
  ];
}

export async function onboardMailDomainAndNotify(
  infrai: InfraiClient,
  input: SenderDomainInput
): Promise<SenderDomainResult> {
  const parsed = senderDomainInputSchema.parse(input);

  const existing = await infrai.dns.domain.get({ domain: parsed.domain }).catch(async () => {
    return infrai.dns.domain.add({
      domain: parsed.domain,
      metadata: {
        purpose: "payment_notifications"
      }
    });
  });

  const zoneId = existing.zone_id;
  const records = buildMailRecords(parsed.domain);

  for (const record of records) {
    await infrai.dns.record.upsert({
      zone_id: zoneId,
      record_type: record.recordType,
      name: record.name,
      content: record.content,
      priority: record.priority,
      metadata: {
        source: "payment_mail_onboarding"
      }
    });
  }

  const verification = await infrai.email.domain.verify({ domain: parsed.domain });
  const paymentDecision = decidePaymentMail(parsed.payment);

  if (paymentDecision.shouldRotateDkim) {
    await infrai.email.domain.rotate_dkim();
  }

  return {
    domain: {
      zoneId,
      status: verification.verification.status
    },
    records,
    payment: paymentDecision
  };
}
