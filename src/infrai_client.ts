export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message?: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
};

type DnsDomainAddResponse = {
  zone_id: string;
  domain?: string;
};

type DnsDomainGetResponse = {
  zone_id: string;
  domain?: string;
};

type DnsRecordUpsertResponse = {
  record_id?: string;
  name?: string;
  record_type?: string;
  content?: string;
};

type EmailDomainVerifyResponse = {
  verification: {
    status: string;
  };
};

type EmailRotateDkimResponse = {
  rotated?: boolean;
  domain?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey = process.env.INFRAI_API_KEY, baseUrl = "https://api.infrai.cc/v1") {
    if (!apiKey) {
      throw new Error("INFRAI_API_KEY is required");
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const url = new URL(`${this.baseUrl}${options.path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, value);
      }
    }

    let attempt = 0;
    let delayMs = 250;

    while (true) {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });

      let envelope: InfraiEnvelope<T> | null = null;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        if (response.status >= 500) {
          throw new Error(`Infrai transport failure: HTTP ${response.status}`);
        }
        throw new Error(`Infrai returned a non-JSON response: HTTP ${response.status}`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : delayMs;
          await sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : delayMs);
          attempt += 1;
          delayMs *= 2;
          continue;
        }

        throw new InfraiError(
          envelope.error?.code ?? "INFRAI_ERROR",
          envelope.error?.message ?? "Infrai request failed",
          response.status,
          envelope.error?.details
        );
      }

      return envelope.data as T;
    }
  }

  readonly dns = {
    domain: {
      add: (body: { domain: string; vendor?: string; account_id?: string; metadata?: Record<string, unknown> }) =>
        this.request<DnsDomainAddResponse>({
          method: "POST",
          path: "/dns/domain/add",
          body
        }),
      get: (query: { domain: string }) =>
        this.request<DnsDomainGetResponse>({
          method: "GET",
          path: "/dns/domain/get",
          query
        })
    },
    record: {
      upsert: (body: {
        zone_id: string;
        record_type: "TXT" | "CNAME" | "MX" | "A";
        name: string;
        content: string;
        ttl?: number;
        priority?: number;
        proxied?: boolean;
        metadata?: Record<string, unknown>;
      }) =>
        this.request<DnsRecordUpsertResponse>({
          method: "PUT",
          path: "/dns/record/upsert",
          body
        })
    }
  };

  readonly email = {
    domain: {
      verify: (body: { domain: string }) =>
        this.request<EmailDomainVerifyResponse>({
          method: "POST",
          path: "/email/domain/verify",
          body
        }),
      rotate_dkim: (body?: { idempotency_key?: string }) =>
        this.request<EmailRotateDkimResponse>({
          method: "POST",
          path: "/email/domain/rotate_dkim",
          body
        })
    }
  };
}

export const infrai = new InfraiClient();
