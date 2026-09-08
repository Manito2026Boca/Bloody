-- Internal SQL execution; no HTTP endpoint, frontend polling or user EXECUTE.
create extension if not exists pg_cron;
select cron.schedule('manito-recurring-services','*/15 * * * *',
  'select private.generate_due_recurring_orders();');
