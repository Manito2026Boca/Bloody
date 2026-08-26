insert into public.services (slug, name, emoji, base_price) values
  ('mecanica_automotor', 'Mecánica automotor', 'wrench', 28000),
  ('gomeria', 'Gomería', 'circle', 17000),
  ('chapa_pintura_auto', 'Chapa y pintura', 'paint', 32000)
on conflict (slug) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  base_price = excluded.base_price,
  active = true;
