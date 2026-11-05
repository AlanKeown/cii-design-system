-- S8 prototype, installed only in the disposable connection's pg_temp schema.
-- Replace retained vertices AFTER projecting freehand geometry into the target CRS.
-- Projecting retained target coordinates through display space would lose exact equality.
CREATE OR REPLACE FUNCTION pg_temp.rebuild_polygon(
  input jsonb, input_srid integer, target_srid integer, origins jsonb,
  stored jsonb DEFAULT NULL, base_version text DEFAULT NULL, current_version text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
  ring jsonb;
  vertex jsonb;
  origin jsonb;
  coordinate jsonb;
  cursor_index integer := 0;
  ring_index integer := 0;
  vertex_index integer;
  source_srid integer;
  projected geometry;
BEGIN
  IF input->>'type' <> 'Polygon' OR input_srid <= 0 OR target_srid <= 0 THEN
    RAISE EXCEPTION 'Polygon and explicit positive SRIDs required';
  END IF;
  result := ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(input),input_srid),target_srid),17,0)::jsonb;
  FOR ring IN SELECT value FROM jsonb_array_elements(result->'coordinates') LOOP
    vertex_index := 0;
    FOR vertex IN SELECT value FROM jsonb_array_elements(ring) LOOP
      IF jsonb_array_length(vertex) <> 2 THEN RAISE EXCEPTION 'Prototype requires XY vertices'; END IF;
      origin := origins->cursor_index;
      IF origin->>'kind' = 'stored' THEN
        IF base_version IS NULL OR current_version IS DISTINCT FROM base_version THEN
          RAISE EXCEPTION 'EDIT_CONFLICT';
        END IF;
        IF stored->>'type' <> 'Polygon' OR jsonb_array_length(origin->'path') <> 2 THEN
          RAISE EXCEPTION 'Invalid stored polygon path';
        END IF;
        coordinate := stored #> ARRAY['coordinates',origin->'path'->>0,origin->'path'->>1];
      ELSIF origin->>'kind' = 'snapped' THEN
        -- Fixed spike CRS allow-list. Production resolves authorities through its authorised descriptor.
        source_srid := CASE origin->>'crs' WHEN 'EPSG:7856' THEN 7856 WHEN 'EPSG:7844' THEN 7844 WHEN 'EPSG:3857' THEN 3857 END;
        IF source_srid IS NULL THEN RAISE EXCEPTION 'Unknown snapped CRS'; END IF;
        projected := ST_Transform(ST_SetSRID(ST_MakePoint((origin->'coordinate'->>0)::float8,(origin->'coordinate'->>1)::float8),source_srid),target_srid);
        coordinate := jsonb_build_array(ST_X(projected),ST_Y(projected));
      ELSIF origin->>'kind' = 'freehand' THEN coordinate := vertex;
      ELSE RAISE EXCEPTION 'Missing or invalid vertex origin';
      END IF;
      IF coordinate IS NULL OR jsonb_typeof(coordinate) <> 'array' OR jsonb_array_length(coordinate) <> 2 THEN
        RAISE EXCEPTION 'Stored/snapped vertex is missing or not XY';
      END IF;
      result := jsonb_set(result,ARRAY['coordinates',ring_index::text,vertex_index::text],coordinate);
      cursor_index := cursor_index + 1;
      vertex_index := vertex_index + 1;
    END LOOP;
    ring_index := ring_index + 1;
  END LOOP;
  IF cursor_index <> jsonb_array_length(origins) THEN RAISE EXCEPTION 'Vertex origin count differs'; END IF;
  PERFORM ST_GeomFromGeoJSON(result); -- includes ring closure validation
  RETURN result;
END $$;
