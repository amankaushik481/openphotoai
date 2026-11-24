import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentWebhookError } from "@/providers/payment/errors";
import { createStripePaymentProvider, STRIPE_API_VERSION, stripePriceEnvVar } from "@/providers/payment/stripe";
import type { CheckoutInput, PaymentEvent, PaymentProvider } from "@/providers/types";

const sdk = vi.hoisted(() => ({
  constructed: [] as unknown[][],
  constructEventAsync: vi.fn(),
  sessionsCreate: vi.fn(),
  sessionsList: vi.fn(),
  invoicePaymentsList: vi.fn(),
  portalCreate: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  subscriptionsCancel: vi.fn(),
}));

vi.mock("stripe", () => {
  class FakeStripe {
    webhooks = { constructEventAsync: sdk.constructEventAsync };
    checkout = { sessions: { create: sdk.sessionsCreate, list: sdk.sessionsList } };
    invoicePayments = { list: sdk.invoicePaymentsList };
    billingPortal = { sessions: { create: sdk.portalCreate } };
    subscriptions = { retrieve: sdk.subscriptionsRetrieve, cancel: sdk.subscriptionsCancel };
    constructor(...args: unknown[]) {
      sdk.constructed.push(args);
    }
  }
  return { default: FakeStripe, Stripe: FakeStripe };
});

const GOOD_SIG = "t=1,v1=good";
const CREATED = 1_793_000_000;
let provider: PaymentProvider;

beforeEach(() => {
  vi.clearAllMocks();
  sdk.constructed.length = 0;
  // Stand-in for Stripe's HMAC verification: only GOOD_SIG with the configured secret passes.
  sdk.constructEventAsync.mockImplementation(async (payload: string, sig: string, secret: string) => {
    if (sig !== GOOD_SIG || secret !== "whsec_test") throw new Error("No signatures found matching the expected signature");
    return JSON.parse(payload) as unknown;
  });
  sdk.sessionsCreate.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
  sdk.sessionsList.mockResolvedValue({ data: [] });
  sdk.invoicePaymentsList.mockResolvedValue({ data: [] });
  sdk.portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/p/session/x" });
  provider = createStripePaymentProvider({ secretKey: "sk_test_123", webhookSecret: "whsec_test" });
});

afterEach(() => {
  for (const key of Object.keys(process.env)) if (key.startsWith("STRIPE_PRICE_")) delete process.env[key];
});

const checkoutInput = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  userId: "usr_1",
  email: "jane@example.com",
  customerId: null,
  item: { type: "credit_pack", packId: "credits_500" },
  successUrl: "http://localhost:3000/app/billing?success=1",
  cancelUrl: "http://localhost:3000/app/billing?canceled=1",
  ...over,
});

function event(type: string, object: Record<string, unknown>, id = "evt_1"): string {
  return JSON.stringify({ id, object: "event", type, created: CREATED, data: { object } });
}

function deliver(rawBody: string, signature: string | null = GOOD_SIG): Promise<PaymentEvent> {
  const headers = new Headers(signature ? { "stripe-signature": signature } : {});
  return provider.parseWebhook({ headers, rawBody, url: "https://app.example.com/api/webhooks/payments/stripe" });
}

const stripeSubscription = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  object: "subscription",
  customer: "cus_1",
  status: "active",
  cancel_at_period_end: false,
  cancel_at: null,
  metadata: { userId: "usr_1", kind: "plan", planId: "pro", interval: "month" },
  items: {
    data: [
      {
        id: "si_1",
        current_period_end: CREATED + 30 * 86400,
        price: { id: "price_inline", metadata: {}, recurring: { interval: "month" } },
      },
    ],
  },
  ...over,
});

const stripeInvoice = (over: Record<string, unknown> = {}) => ({
  id: "in_1",
  object: "invoice",
  customer: "cus_1",
  amount_paid: 3900,
  currency: "usd",
  billing_reason: "subscription_create",
  parent: {
    type: "subscription_details",
    subscription_details: { subscription: "sub_1", metadata: { userId: "usr_1", planId: "pro", interval: "month" } },
  },
  lines: { data: [] },
  ...over,
});

describe("createCheckout", () => {
  it("builds a one-time payment session with inline price_data for credit packs", async () => {
    const result = await provider.createCheckout(checkoutInput());
    expect(result).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1", checkoutId: "cs_test_1" });
    expect(sdk.constructed[0]).toEqual(["sk_test_123", expect.objectContaining({ apiVersion: STRIPE_API_VERSION })]);

    const params = sdk.sessionsCreate.mock.calls[0]![0];
    expect(params).toMatchObject({
      mode: "payment",
      client_reference_id: "usr_1",
      customer_email: "jane@example.com",
      customer_creation: "always",
      // Off unless STRIPE_ALLOW_PROMOTION_CODES=true: Stripe would accept any code in the account.
      allow_promotion_codes: false,
      automatic_tax: { enabled: false },
      success_url: "http://localhost:3000/app/billing?success=1",
      cancel_url: "http://localhost:3000/app/billing?canceled=1",
      metadata: { userId: "usr_1", kind: "credit_pack", creditPackId: "credits_500" },
      payment_intent_data: { metadata: { userId: "usr_1", kind: "credit_pack", creditPackId: "credits_500" } },
      line_items: [
        {
          quantity: 1,
          price_data: { currency: "usd", unit_amount: 3900, product_data: { name: expect.stringContaining("500 credits") } },
        },
      ],
    });
    expect(params.customer).toBeUndefined();
    expect(params.subscription_data).toBeUndefined();
    expect(params.line_items[0].price_data.recurring).toBeUndefined();
  });

  it("builds a subscription session for plans and reuses the customer", async () => {
    await provider.createCheckout(checkoutInput({ customerId: "cus_9", item: { type: "plan", planId: "pro", interval: "year" } }));
    const params = sdk.sessionsCreate.mock.calls[0]![0];
    const metadata = { userId: "usr_1", kind: "plan", planId: "pro", interval: "year" };
    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_9",
      metadata,
      subscription_data: { metadata },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 39000,
            recurring: { interval: "year" },
            product_data: {
              name: expect.stringContaining("Pro"),
              description: expect.any(String),
              metadata: { planId: "pro", interval: "year" },
            },
          },
        },
      ],
    });
    expect(params.customer_email).toBeUndefined();
    expect(params.customer_creation).toBeUndefined();
  });

  it("uses a pinned price from STRIPE_PRICE_* env vars", async () => {
    expect(stripePriceEnvVar({ type: "plan", planId: "pro", interval: "month" })).toBe("STRIPE_PRICE_PRO_MONTH");
    expect(stripePriceEnvVar({ type: "credit_pack", packId: "credits_500" })).toBe("STRIPE_PRICE_CREDITS_500");
    process.env.STRIPE_PRICE_PRO_MONTH = "price_pro_m";
    process.env.STRIPE_PRICE_CREDITS_500 = "price_500";
    await provider.createCheckout(checkoutInput({ item: { type: "plan", planId: "pro", interval: "month" } }));
    await provider.createCheckout(checkoutInput());
    expect(sdk.sessionsCreate.mock.calls[0]![0].line_items).toEqual([{ price: "price_pro_m", quantity: 1 }]);
    expect(sdk.sessionsCreate.mock.calls[1]![0].line_items).toEqual([{ price: "price_500", quantity: 1 }]);
  });

  it("shows the promotion-code box only when STRIPE_ALLOW_PROMOTION_CODES=true", async () => {
    process.env.STRIPE_ALLOW_PROMOTION_CODES = "true";
    try {
      await provider.createCheckout(checkoutInput());
      expect(sdk.sessionsCreate.mock.calls[0]![0].allow_promotion_codes).toBe(true);
    } finally {
      delete process.env.STRIPE_ALLOW_PROMOTION_CODES;
    }
  });

  it("creates the SDK client once (lazily)", async () => {
    await provider.createCheckout(checkoutInput());
    await provider.createPortal({ customerId: "cus_1", returnUrl: "http://localhost:3000/app/billing" });
    expect(sdk.constructed).toHaveLength(1);
  });
});

describe("portal + subscriptions", () => {
  it("creates a billing portal session", async () => {
    await expect(provider.createPortal({ customerId: "cus_1", returnUrl: "http://r" })).resolves.toEqual({
      url: "https://billing.stripe.com/p/session/x",
    });
    expect(sdk.portalCreate).toHaveBeenCalledWith({ customer: "cus_1", return_url: "http://r" });
  });

  it("getSubscription normalizes and returns null for a missing subscription", async () => {
    sdk.subscriptionsRetrieve.mockResolvedValueOnce(stripeSubscription());
    await expect(provider.getSubscription("sub_1")).resolves.toMatchObject({ subscriptionId: "sub_1", planId: "pro", status: "active" });
    sdk.subscriptionsRetrieve.mockRejectedValueOnce(Object.assign(new Error("No such subscription"), { code: "resource_missing" }));
    await expect(provider.getSubscription("sub_x")).resolves.toBeNull();
  });

  it("cancelSubscription cancels immediately and tolerates already-deleted subscriptions", async () => {
    await provider.cancelSubscription("sub_1");
    expect(sdk.subscriptionsCancel).toHaveBeenCalledWith("sub_1");
    sdk.subscriptionsCancel.mockRejectedValueOnce(Object.assign(new Error("gone"), { code: "resource_missing" }));
    await expect(provider.cancelSubscription("sub_2")).resolves.toBeUndefined();
  });
});

describe("parseWebhook", () => {
  it("rejects missing and invalid signatures (not retryable)", async () => {
    const body = event("checkout.session.completed", {});
    await expect(deliver(body, null)).rejects.toBeInstanceOf(PaymentWebhookError);
    await expect(deliver(body, null)).rejects.toMatchObject({ retryable: false });
    await expect(deliver(body, "t=1,v1=forged")).rejects.toThrow(/Invalid Stripe webhook signature/);
    expect(sdk.constructEventAsync).toHaveBeenCalledWith(body, "t=1,v1=forged", "whsec_test");
  });

  it("normalizes a paid credit-pack checkout", async () => {
    const body = event("checkout.session.completed", {
      id: "cs_1",
      object: "checkout.session",
      mode: "payment",
      payment_status: "paid",
      client_reference_id: "usr_1",
      customer: "cus_1",
      subscription: null,
      amount_total: 3900,
      currency: "usd",
      metadata: { userId: "usr_1", kind: "credit_pack", creditPackId: "credits_500" },
    });
    await expect(deliver(body)).resolves.toEqual({
      type: "checkout.completed",
      eventId: "evt_1",
      createdAt: new Date(CREATED * 1000),
      userId: "usr_1",
      customerId: "cus_1",
      mode: "payment",
      checkoutId: "cs_1",
      creditPackId: "credits_500",
      planId: undefined,
      interval: undefined,
      subscriptionId: undefined,
      amountCents: 3900,
      currency: "usd",
    });
  });

  it("normalizes a subscription checkout and async payment success", async () => {
    const session = {
      id: "cs_2",
      mode: "subscription",
      payment_status: "paid",
      client_reference_id: "usr_1",
      customer: { id: "cus_1" },
      subscription: "sub_1",
      amount_total: 1500,
      currency: "usd",
      metadata: { userId: "usr_1", kind: "plan", planId: "starter", interval: "month" },
    };
    await expect(deliver(event("checkout.session.completed", session))).resolves.toMatchObject({
      type: "checkout.completed",
      mode: "subscription",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      planId: "starter",
      interval: "month",
    });
    await expect(
      deliver(
        event("checkout.session.async_payment_succeeded", {
          ...session,
          mode: "payment",
          subscription: null,
          metadata: { userId: "usr_1", kind: "credit_pack", creditPackId: "credits_100" },
        }),
      ),
    ).resolves.toMatchObject({ type: "checkout.completed", mode: "payment", creditPackId: "credits_100" });
  });

  it("ignores unpaid (async pending) and foreign checkouts", async () => {
    const base = { id: "cs_3", mode: "payment", payment_status: "unpaid", client_reference_id: "usr_1", metadata: {} };
    await expect(deliver(event("checkout.session.completed", base))).resolves.toMatchObject({ type: "ignored" });
    await expect(
      deliver(event("checkout.session.completed", { ...base, payment_status: "paid", client_reference_id: null })),
    ).resolves.toEqual({ type: "ignored", eventId: "evt_1", createdAt: new Date(CREATED * 1000), rawType: "checkout.session.completed" });
  });

  it("normalizes subscription created/updated/deleted", async () => {
    await expect(deliver(event("customer.subscription.created", stripeSubscription({ status: "incomplete" })))).resolves.toEqual({
      type: "subscription.updated",
      eventId: "evt_1",
      createdAt: new Date(CREATED * 1000),
      subscription: {
        subscriptionId: "sub_1",
        customerId: "cus_1",
        userId: "usr_1",
        planId: "pro",
        interval: "month",
        status: "incomplete",
        currentPeriodEnd: new Date((CREATED + 30 * 86400) * 1000),
        cancelAtPeriodEnd: false,
      },
    });
    await expect(
      deliver(event("customer.subscription.updated", stripeSubscription({ cancel_at_period_end: true }))),
    ).resolves.toMatchObject({ type: "subscription.updated", subscription: { cancelAtPeriodEnd: true } });
    await expect(
      deliver(event("customer.subscription.deleted", stripeSubscription({ status: "incomplete_expired" }))),
    ).resolves.toMatchObject({ type: "subscription.deleted", subscription: { status: "canceled" } });
  });

  it("resolves the plan of a subscription from a pinned price when metadata is missing", async () => {
    process.env.STRIPE_PRICE_STUDIO_YEAR = "price_studio_y";
    const body = event(
      "customer.subscription.updated",
      stripeSubscription({
        metadata: {},
        items: { data: [{ current_period_end: CREATED, price: { id: "price_studio_y", metadata: {}, recurring: { interval: "year" } } }] },
      }),
    );
    await expect(deliver(body)).resolves.toMatchObject({ subscription: { planId: "studio", interval: "year", userId: undefined } });
    await expect(
      deliver(event("customer.subscription.updated", stripeSubscription({ metadata: {}, items: { data: [{ price: { id: "price_other" } }] } }))),
    ).resolves.toMatchObject({ type: "ignored" });
  });

  it("normalizes invoice.paid with plan metadata from the subscription snapshot or the lines", async () => {
    await expect(deliver(event("invoice.paid", stripeInvoice()))).resolves.toEqual({
      type: "invoice.paid",
      eventId: "evt_1",
      createdAt: new Date(CREATED * 1000),
      invoiceId: "in_1",
      subscriptionId: "sub_1",
      customerId: "cus_1",
      amountCents: 3900,
      currency: "usd",
      billingReason: "subscription_create",
      planId: "pro",
      interval: "month",
      userId: "usr_1",
    });

    process.env.STRIPE_PRICE_STARTER_YEAR = "price_starter_y";
    const fromLines = stripeInvoice({
      billing_reason: "subscription_cycle",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_2", metadata: null } },
      lines: { data: [{ metadata: {}, pricing: { type: "price_details", price_details: { price: "price_starter_y", product: "prod_1" } } }] },
    });
    await expect(deliver(event("invoice.paid", fromLines))).resolves.toMatchObject({
      subscriptionId: "sub_2",
      billingReason: "subscription_cycle",
      planId: "starter",
      interval: "year",
      userId: undefined,
    });
  });

  it("ignores invoices that don't belong to a subscription", async () => {
    await expect(deliver(event("invoice.paid", stripeInvoice({ parent: null })))).resolves.toMatchObject({ type: "ignored" });
  });

  it("normalizes invoice.payment_failed", async () => {
    await expect(deliver(event("invoice.payment_failed", stripeInvoice()))).resolves.toEqual({
      type: "invoice.payment_failed",
      eventId: "evt_1",
      createdAt: new Date(CREATED * 1000),
      invoiceId: "in_1",
      subscriptionId: "sub_1",
      customerId: "cus_1",
    });
  });

  it("maps charge.refunded to the original checkout session", async () => {
    sdk.sessionsList.mockResolvedValueOnce({ data: [{ id: "cs_1", metadata: { userId: "usr_1", kind: "credit_pack" } }] });
    const charge = { id: "ch_1", payment_intent: "pi_1", amount: 3900, amount_refunded: 1000, refunded: false };
    await expect(deliver(event("charge.refunded", charge))).resolves.toEqual({
      type: "payment.refunded",
      eventId: "evt_1",
      createdAt: new Date(CREATED * 1000),
      paymentId: "cs_1",
      amountRefundedCents: 1000,
      fullyRefunded: false,
    });
    expect(sdk.sessionsList).toHaveBeenCalledWith({ payment_intent: "pi_1", limit: 1 });
  });

  it("maps charge.refunded to the invoice when the payment intent paid an invoice", async () => {
    sdk.invoicePaymentsList.mockResolvedValueOnce({ data: [{ invoice: "in_7" }] });
    const charge = { id: "ch_2", payment_intent: { id: "pi_2" }, amount_refunded: 3900, refunded: true };
    await expect(deliver(event("charge.refunded", charge))).resolves.toMatchObject({
      type: "payment.refunded",
      paymentId: "in_7",
      fullyRefunded: true,
    });
    expect(sdk.invoicePaymentsList).toHaveBeenCalledWith({
      payment: { type: "payment_intent", payment_intent: "pi_2" },
      limit: 1,
      expand: ["data.invoice"],
    });
  });

  it("ignores refunds it can't attribute; a failed lookup is retryable", async () => {
    await expect(deliver(event("charge.refunded", { id: "ch_3", payment_intent: "pi_3", amount_refunded: 1, refunded: false }))).resolves.toMatchObject({
      type: "ignored",
    });
    await expect(deliver(event("charge.refunded", { id: "ch_4", payment_intent: null }))).resolves.toMatchObject({ type: "ignored" });

    sdk.sessionsList.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(deliver(event("charge.refunded", { id: "ch_5", payment_intent: "pi_5" }))).rejects.toMatchObject({
      name: "PaymentWebhookError",
      retryable: true,
    });
  });

  it("ignores every other event type", async () => {
    await expect(deliver(event("customer.created", { id: "cus_1" }))).resolves.toEqual({
      type: "ignored",
      eventId: "evt_1",
      createdAt: new Date(CREATED * 1000),
      rawType: "customer.created",
    });
  });
});

describe("parseWebhook: review regressions (docs/reviews/payments.md)", () => {
  it("PAY-6: the billed (pinned) price wins over stale subscription metadata", async () => {
    process.env.STRIPE_PRICE_STARTER_MONTH = "price_starter_m";
    const downgraded = stripeSubscription({
      metadata: { userId: "usr_1", kind: "plan", planId: "studio", interval: "month" },
      items: { data: [{ current_period_end: CREATED, price: { id: "price_starter_m", metadata: {}, recurring: { interval: "month" } } }] },
    });
    await expect(deliver(event("customer.subscription.updated", downgraded))).resolves.toMatchObject({
      subscription: { planId: "starter", interval: "month", userId: "usr_1" },
    });

    const invoice = stripeInvoice({
      billing_reason: "subscription_cycle",
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_1", metadata: { userId: "usr_1", planId: "studio", interval: "month" } },
      },
      lines: { data: [{ amount: 1500, metadata: {}, pricing: { type: "price_details", price_details: { price: "price_starter_m", product: "prod_1" } } }] },
    });
    await expect(deliver(event("invoice.paid", invoice))).resolves.toMatchObject({ planId: "starter", interval: "month", userId: "usr_1" });
  });

  it("PAY-6: inline prices resolve the plan from product metadata, the interval from the price", async () => {
    const sub = stripeSubscription({
      metadata: { userId: "usr_1", kind: "plan", planId: "pro", interval: "month" },
      items: {
        data: [
          {
            current_period_end: CREATED,
            price: { id: "price_inline", metadata: {}, recurring: { interval: "year" }, product: { id: "prod_1", metadata: { planId: "studio", interval: "year" } } },
          },
        ],
      },
    });
    await expect(deliver(event("customer.subscription.updated", sub))).resolves.toMatchObject({
      subscription: { planId: "studio", interval: "year" },
    });
  });

  it("PAY-10: ignores checkouts not created by our checkout; server metadata wins over client_reference_id", async () => {
    const paymentLink = {
      id: "cs_pl",
      mode: "subscription",
      payment_status: "paid",
      client_reference_id: "victim_user",
      customer: "cus_attacker",
      subscription: "sub_att",
      metadata: {},
      amount_total: 100,
      currency: "usd",
    };
    await expect(deliver(event("checkout.session.completed", paymentLink))).resolves.toMatchObject({ type: "ignored" });
    await expect(
      deliver(event("checkout.session.completed", { ...paymentLink, mode: "payment", metadata: { kind: "plan", userId: "usr_1" } })),
    ).resolves.toMatchObject({ type: "ignored" });

    const ours = { ...paymentLink, metadata: { userId: "usr_1", kind: "plan", planId: "pro", interval: "month" } };
    await expect(deliver(event("checkout.session.completed", ours))).resolves.toMatchObject({ type: "checkout.completed", userId: "usr_1" });
  });

  it("PAY-11: passes the invoice total (after discounts) along", async () => {
    await expect(deliver(event("invoice.paid", stripeInvoice({ amount_paid: 0, total: 0 })))).resolves.toMatchObject({
      type: "invoice.paid",
      amountCents: 0,
      totalCents: 0,
    });
  });

  it("PAY-1: maps charge.dispute.created / funds_withdrawn / closed to dispute events", async () => {
    sdk.invoicePaymentsList.mockResolvedValue({
      data: [
        {
          invoice: {
            id: "in_9",
            parent: { subscription_details: { subscription: "sub_9", metadata: { userId: "usr_1", kind: "plan", planId: "studio", interval: "year" } } },
            lines: { data: [] },
          },
        },
      ],
    });
    const dispute = { id: "dp_1", charge: "ch_1", payment_intent: "pi_9", amount: 390000, reason: "fraudulent", status: "needs_response" };
    for (const type of ["charge.dispute.created", "charge.dispute.funds_withdrawn"]) {
      await expect(deliver(event(type, dispute))).resolves.toEqual({
        type: "payment.disputed",
        eventId: "evt_1",
        createdAt: new Date(CREATED * 1000),
        paymentId: "in_9",
        subscriptionId: "sub_9",
        disputeId: "dp_1",
        amountCents: 390000,
        reason: "fraudulent",
      });
    }
    for (const [status, won] of [["won", true], ["warning_closed", true], ["lost", false], ["prevented", false]] as const) {
      await expect(deliver(event("charge.dispute.closed", { ...dispute, status }))).resolves.toMatchObject({
        type: "payment.dispute_closed",
        paymentId: "in_9",
        disputeId: "dp_1",
        won,
        status,
      });
    }
    // The payment intent can also come from an expanded charge.
    await expect(
      deliver(event("charge.dispute.created", { ...dispute, payment_intent: null, charge: { id: "ch_1", payment_intent: "pi_9" } })),
    ).resolves.toMatchObject({ type: "payment.disputed", paymentId: "in_9" });
  });

  it("PAY-12: refunds and disputes of payments made outside our checkout are ignored", async () => {
    sdk.sessionsList.mockResolvedValueOnce({ data: [{ id: "cs_other", metadata: {} }] });
    await expect(deliver(event("charge.refunded", { id: "ch_1", payment_intent: "pi_1", amount_refunded: 100, refunded: true }))).resolves.toMatchObject({
      type: "ignored",
    });
    sdk.invoicePaymentsList.mockResolvedValueOnce({
      data: [{ invoice: { id: "in_other", parent: { subscription_details: { subscription: "sub_x", metadata: {} } }, lines: { data: [] } } }],
    });
    await expect(deliver(event("charge.dispute.created", { id: "dp_2", payment_intent: "pi_2", amount: 100, status: "needs_response" }))).resolves.toMatchObject({
      type: "ignored",
    });
  });

  it("PAY-9: a refunded invoice names its subscription", async () => {
    sdk.invoicePaymentsList.mockResolvedValueOnce({
      data: [{ invoice: { id: "in_3", parent: { subscription_details: { subscription: "sub_3", metadata: { userId: "usr_1", kind: "plan" } } }, lines: { data: [] } } }],
    });
    await expect(deliver(event("charge.refunded", { id: "ch_3", payment_intent: "pi_3", amount_refunded: 3900, refunded: true }))).resolves.toEqual({
      type: "payment.refunded",
      eventId: "evt_1",
      createdAt: new Date(CREATED * 1000),
      paymentId: "in_3",
      subscriptionId: "sub_3",
      amountRefundedCents: 3900,
      fullyRefunded: true,
    });
  });
});
