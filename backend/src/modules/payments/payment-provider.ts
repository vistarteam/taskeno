import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../../common/logger';

export type CreatePaymentInput = {
  paymentId: string;
  amount: bigint;
  description: string;
  callbackUrl: string;
  mobile?: string | null;
  email?: string | null;
};

export type CreatePaymentResult = {
  authority: string;
  redirectUrl: string;
  expiresAt: Date;
};

export type VerifyPaymentInput = {
  authority: string;
  amount: bigint;
};

export type VerifyPaymentResult = {
  ok: boolean;
  reference?: string;
  amount?: bigint;
  errorCode?: string;
  errorMessage?: string;
  raw?: Record<string, unknown>;
};

/**
 * Gateway abstraction.
 *
 * Payment providers differ wildly in transport (redirect + callback vs REST
 * webhook) but the platform only needs three operations. Everything specific to
 * a gateway — signing, verifying, refunding — stays behind this interface, and
 * `PaymentsService` never assumes a callback can be trusted.
 */
export interface PaymentProvider {
  readonly key: string;
  readonly displayName: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  refund(input: { authority: string; amount: bigint }): Promise<{ ok: boolean; reference?: string }>;
}

/**
 * Development/staging sandbox.
 *
 * It behaves like a real gateway: it hands out an authority, redirects the
 * browser to a hosted "page", and only confirms the payment after a
 * server-to-server verification call. Outcomes are chosen explicitly so both
 * the success and failure paths can be exercised.
 */
export class SandboxProvider implements PaymentProvider {
  readonly key = 'sandbox';
  readonly displayName = 'درگاه آزمایشی Taskeno';

  /** authority -> intended outcome, set by the sandbox gateway page. */
  private readonly outcomes = new Map<string, 'success' | 'failure'>();

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const authority = `sbx-${randomUUID()}`;
    return {
      authority,
      redirectUrl: `${env.APP_URL}/pay/sandbox/${authority}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const outcome = this.outcomes.get(input.authority) ?? 'success';
    this.outcomes.delete(input.authority);

    if (outcome === 'failure') {
      return { ok: false, errorCode: 'SANDBOX_DECLINED', errorMessage: 'پرداخت آزمایشی ناموفق شد.', raw: { outcome } };
    }

    return { ok: true, reference: `SBXREF-${input.authority.slice(-12)}`, amount: input.amount, raw: { outcome } };
  }

  async refund(): Promise<{ ok: boolean; reference?: string }> {
    return { ok: true, reference: `SBXRF-${Date.now()}` };
  }

  /** Called by the sandbox gateway page before redirecting back. */
  setOutcome(authority: string, outcome: 'success' | 'failure'): void {
    this.outcomes.set(authority, outcome);
  }

  has(authority: string): boolean {
    return this.outcomes.has(authority);
  }
}

/**
 * Zarinpal adapter.
 *
 * Verified against their REST API: request an authority, redirect, then confirm
 * server-side with a verify call. It is wired but inert until `ZARINPAL_MERCHANT_ID`
 * is provided and `PAYMENT_PROVIDER=zarinpal`, which keeps the real merchant
 * contract out of the critical path until the commercial details are settled.
 */
export class ZarinpalProvider implements PaymentProvider {
  readonly key = 'zarinpal';
  readonly displayName = 'زرین‌پال';

  private readonly baseUrl = 'https://api.zarinpal.com/pg/v4/payment';
  private readonly startPayUrl = 'https://www.zarinpal.com/pg/StartPay';

  private get merchantId(): string {
    if (!env.ZARINPAL_MERCHANT_ID) {
      throw new Error('ZARINPAL_MERCHANT_ID is not configured');
    }
    return env.ZARINPAL_MERCHANT_ID;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const response = await fetch(`${this.baseUrl}/request.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        merchant_id: this.merchantId,
        // Zarinpal expects Rial amounts.
        amount: input.amount.toString(),
        description: input.description,
        callback_url: input.callbackUrl,
        ...(input.mobile ? { metadata: { mobile: input.mobile } } : {}),
        ...(input.email ? { metadata: { email: input.email } } : {}),
      }),
    });

    const payload = (await response.json()) as {
      data?: { authority?: string; code?: number };
      errors?: unknown;
    };

    const authority = payload?.data?.authority;
    if (!authority) {
      logger.error({ payload }, 'zarinpal payment request failed');
      throw new Error('PAYMENT_PROVIDER_UNAVAILABLE');
    }

    return {
      authority,
      redirectUrl: `${this.startPayUrl}/${authority}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const response = await fetch(`${this.baseUrl}/verify.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        merchant_id: this.merchantId,
        amount: input.amount.toString(),
        authority: input.authority,
      }),
    });

    const payload = (await response.json()) as {
      data?: { code?: number; ref_id?: number };
      errors?: { code?: number; message?: string };
    };

    const code = payload?.data?.code;
    if (code === 100 || code === 101) {
      return {
        ok: true,
        reference: String(payload.data?.ref_id ?? input.authority),
        amount: input.amount,
        raw: payload as unknown as Record<string, unknown>,
      };
    }

    return {
      ok: false,
      errorCode: String(payload?.errors?.code ?? 'UNKNOWN'),
      errorMessage: payload?.errors?.message ?? 'تأیید پرداخت ناموفق بود.',
      raw: payload as unknown as Record<string, unknown>,
    };
  }

  async refund(): Promise<{ ok: boolean; reference?: string }> {
    // Refunds are handled by the settlement team in the Zarinpal panel; the
    // platform records the refund and reverses the ledger entries.
    return { ok: false };
  }
}

export const createPaymentProvider = (key: string): PaymentProvider => {
  switch (key) {
    case 'zarinpal':
      return new ZarinpalProvider();
    case 'sandbox':
    default:
      return new SandboxProvider();
  }
};
