import { Router } from 'express';
import { PLANS, getPlanLimits } from '../plans.js';

/**
 * Billing/Abo-Endpunkte (Freemium: Free vs. Pro für 2,99 $/€ pro Monat).
 *
 * Die eigentliche Stripe-Integration ist bewusst noch NICHT implementiert.
 * Vorbereitet ist alles bis zu diesem Schritt:
 *   - users.plan / plan_updated_at / stripe_customer_id / stripe_subscription_id (db.js)
 *   - serverseitiges Limit-Enforcement mit HTTP 402 + code "plan_limit" (plans.js/store.js)
 *   - Paywall & Upgrade-Dialog im Frontend
 *
 * TODO (Stripe): In POST /checkout eine Stripe-Checkout-Session erstellen
 * (mode: "subscription", Preis 2,99 $/€ monatlich) und deren URL zurückgeben.
 * Ein Webhook-Endpunkt (POST /api/billing/webhook, mit Signatur-Prüfung über
 * STRIPE_WEBHOOK_SECRET, VOR express.json() als raw body gemountet) setzt bei
 * "checkout.session.completed" bzw. "customer.subscription.deleted" das Feld
 * users.plan auf "pro"/"free" und pflegt stripe_customer_id/-subscription_id.
 */
export function billingRouter(db) {
  const router = Router();

  // GET /api/billing — aktueller Plan, Limits und Preisinfo für die UI.
  router.get('/', (req, res) => {
    const limits = getPlanLimits(db, req.userId);
    res.json({
      plan: limits.plan,
      limits: { maxProjects: limits.maxProjects, maxViewsPerProject: limits.maxViewsPerProject },
      plans: {
        free: {
          id: 'free',
          label: PLANS.free.label,
          maxProjects: PLANS.free.maxProjects,
          maxViewsPerProject: PLANS.free.maxViewsPerProject,
        },
        pro: {
          id: 'pro',
          label: PLANS.pro.label,
          priceMonthly: PLANS.pro.priceMonthly,
          maxProjects: null,
          maxViewsPerProject: null,
        },
      },
    });
  });

  // POST /api/billing/checkout — startet das Pro-Upgrade.
  // TODO (Stripe): Checkout-Session erzeugen und { url } zurückgeben.
  router.post('/checkout', (req, res) => {
    res.status(501).json({
      error:
        'Das Pro-Upgrade ist noch nicht freigeschaltet — die Zahlungsabwicklung (Stripe) folgt in Kürze.',
      code: 'billing_not_configured',
    });
  });

  // POST /api/billing/portal — Stripe-Kundenportal (Abo verwalten/kündigen).
  // TODO (Stripe): Billing-Portal-Session erzeugen und { url } zurückgeben.
  router.post('/portal', (req, res) => {
    res.status(501).json({
      error: 'Die Abo-Verwaltung ist verfügbar, sobald die Stripe-Integration aktiv ist.',
      code: 'billing_not_configured',
    });
  });

  return router;
}
