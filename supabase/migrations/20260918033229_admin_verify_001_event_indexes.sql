create index if not exists professional_verification_events_document_idx
  on private.professional_verification_events (document_id)
  where document_id is not null;

create index if not exists professional_verification_events_actor_idx
  on private.professional_verification_events (actor_id)
  where actor_id is not null;
