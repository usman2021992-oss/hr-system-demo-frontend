import type { TFunction } from 'i18next';
import type { BillingTransaction } from '../../types';

/**
 * Wording for a payment row.
 *
 * The sentence is built here rather than read from the database: a description
 * stored at insert time is frozen in whatever language the server happened to
 * use and can never follow the language the reader selected. The stored text
 * is used only for rows written before payments recorded their kind.
 */
export function billingTransactionLabel(tx: BillingTransaction, t: TFunction): string {
  const employees = tx.seatQuantity ?? 0;
  const terminals = tx.deviceQuantity ?? 0;

  switch (tx.kind) {
    case 'activation':
      return t('billing.txKindActivation', { employees, terminals });
    case 'license_upgrade':
      return t('billing.txKindUpgrade', { employees, terminals });
    case 'renewal':
      return t('billing.txKindRenewal', { employees, terminals });
    case 'failed':
      return t('billing.txKindFailed');
    default:
      return tx.description || t('billing.txKindRenewal', { employees, terminals });
  }
}

/**
 * Turns a billing API failure into a message in the user's language.
 *
 * The server answers with a machine-readable `code` plus an English or Italian
 * sentence. Showing that sentence directly means the toast ignores the language
 * the user picked, so the code is translated here and the server text is only
 * a last resort for cases we do not model.
 */
export function billingErrorMessage(err: any, t: TFunction): string {
  const data = err?.response?.data ?? {};
  const code: string | undefined = data.code;

  switch (code) {
    case 'LICENSE_LIMIT_REACHED':
      return data.resource === 'terminal'
        ? t('billing.err_licenseLimitTerminal', {
            inUse: data.inUse,
            licensed: data.licensed,
          })
        : t('billing.err_licenseLimitEmployee', {
            inUse: data.inUse,
            licensed: data.licensed,
          });

    case 'COMPANY_DETAILS_INCOMPLETE':
      return t('billing.err_companyDetailsIncomplete');

    case 'PRICING_NOT_CONFIGURED':
      return t('billing.err_pricingNotConfigured');

    case 'NOTHING_TO_BILL':
      return t('billing.err_nothingToBill');

    case 'SUBSCRIPTION_ALREADY_ACTIVE':
      return t('billing.err_alreadyActive');

    case 'LICENSES_BELOW_USAGE':
      return data.resource === 'terminal'
        ? t('billing.err_belowUsageTerminal', { inUse: data.inUse })
        : t('billing.err_belowUsageEmployee', { inUse: data.inUse });

    case 'UPGRADE_IN_PROGRESS':
      return t('billing.err_upgradeInProgress');

    case 'NO_ACTIVE_SUBSCRIPTION':
      return t('billing.err_noActiveSubscription');

    case 'PROVIDER_SUBSCRIPTION_MISSING':
      return t('billing.providerSubscriptionMissing');

    case 'PROVIDER_NOT_SUPPORTED':
      return t('billing.err_providerNotSupported');

    case 'SUBSCRIPTION_REQUIRED':
      return t('billing.err_subscriptionRequired');

    case 'SUBSCRIPTION_BLOCKED':
      return t('billing.err_subscriptionBlocked');

    case 'INVALID_LICENSES':
      return t('billing.err_invalidLicenses');

    default:
      return data.error || data.message || t('billing.err_generic');
  }
}
