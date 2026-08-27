-- Expand MANITO beyond home trades while keeping regulated health/legal out of the MVP catalog.

insert into public.services (slug, name, emoji, base_price, active) values
  ('arquitectura', 'Arquitectura', 'building', 45000, true),
  ('ingenieria', 'Ingeniería', 'briefcase', 52000, true),
  ('diseno_interiores', 'Diseño de interiores', 'palette', 38000, true),
  ('fotografia', 'Fotografía', 'camera', 35000, true),
  ('profesores_particulares', 'Profesores particulares', 'graduation-cap', 14000, true),
  ('soporte_remoto', 'Soporte tecnológico remoto', 'monitor', 12000, true)
on conflict (slug) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  base_price = excluded.base_price,
  active = true;

with catalog(slug, specialty_name, position) as (
  values
    ('arquitectura', 'Proyecto de vivienda', 1),
    ('arquitectura', 'Reformas y ampliaciones', 2),
    ('arquitectura', 'Planos', 3),
    ('arquitectura', 'Regularizaciones', 4),
    ('arquitectura', 'Dirección de obra', 5),
    ('arquitectura', 'Relevamientos', 6),
    ('arquitectura', 'Consultas técnicas', 7),
    ('arquitectura', 'Cómputo y presupuesto', 8),
    ('arquitectura', 'Renderizado / visualización', 9),
    ('ingenieria', 'Ingeniería civil', 1),
    ('ingenieria', 'Ingeniería eléctrica', 2),
    ('ingenieria', 'Ingeniería mecánica', 3),
    ('ingenieria', 'Ingeniería industrial', 4),
    ('ingenieria', 'Seguridad e higiene', 5),
    ('ingenieria', 'Instalaciones', 6),
    ('ingenieria', 'Cálculo estructural', 7),
    ('ingenieria', 'Peritajes', 8),
    ('ingenieria', 'Consultoría', 9),
    ('diseno_interiores', 'Ambientación', 1),
    ('diseno_interiores', 'Distribución de espacios', 2),
    ('diseno_interiores', 'Mobiliario', 3),
    ('diseno_interiores', 'Iluminación decorativa', 4),
    ('diseno_interiores', 'Materiales y terminaciones', 5),
    ('diseno_interiores', 'Renderizado', 6),
    ('fotografia', 'Eventos', 1),
    ('fotografia', 'Producto', 2),
    ('fotografia', 'Retratos', 3),
    ('fotografia', 'Inmuebles', 4),
    ('fotografia', 'Video corto', 5),
    ('fotografia', 'Edición', 6),
    ('profesores_particulares', 'Apoyo escolar', 1),
    ('profesores_particulares', 'Matemática', 2),
    ('profesores_particulares', 'Inglés', 3),
    ('profesores_particulares', 'Portugués', 4),
    ('profesores_particulares', 'Universitario', 5),
    ('profesores_particulares', 'Música', 6),
    ('soporte_remoto', 'PC y notebooks', 1),
    ('soporte_remoto', 'Wi-Fi y redes', 2),
    ('soporte_remoto', 'Instalación de software', 3),
    ('soporte_remoto', 'Configuración de celulares', 4),
    ('soporte_remoto', 'Asistencia remota', 5),
    ('soporte_remoto', 'Backup y seguridad', 6)
)
insert into public.specialties (service_id, name, position, active)
select services.id, catalog.specialty_name, catalog.position, true
from catalog
join public.services on services.slug = catalog.slug
on conflict (service_id, name) do update set
  position = excluded.position,
  active = true;
