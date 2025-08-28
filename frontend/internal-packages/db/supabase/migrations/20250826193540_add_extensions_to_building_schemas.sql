begin;

-- Update all existing building_schemas records to include extensions field
-- This migration adds the extensions field to the schema and initial_schema_snapshot JSONB columns
-- for compatibility with the new Schema interface that includes extensions support

-- Update schema column in building_schemas
update public.building_schemas 
set schema = schema || '{"extensions": {}}'::jsonb
where schema is not null 
  and not (schema ? 'extensions');

-- Update initial_schema_snapshot in building_schemas to include extensions field
update public.building_schemas
set initial_schema_snapshot = initial_schema_snapshot || '{"extensions": {}}'::jsonb
where initial_schema_snapshot is not null
  and not (initial_schema_snapshot ? 'extensions');

comment on table public.building_schemas is 'Building schemas with tables, enums, and extensions information stored as JSONB';

commit;
