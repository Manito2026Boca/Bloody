import { resolveDomainOrigins } from '../../app/lib/domainMigrationContract';

export const domainMigrationOrderId = '11111111-2222-4333-8444-555555555555';
export const domainMigrationOrigins = resolveDomainOrigins({
  configuredAppOrigin: 'https://app.manitoapp.com.ar',
  environment: 'test',
});
export const domainMigrationKnownServices = new Set(['plomeria', 'electricidad']);
export const domainMigrationIntentContext = {
  origins: domainMigrationOrigins,
  knownServices: domainMigrationKnownServices,
};
