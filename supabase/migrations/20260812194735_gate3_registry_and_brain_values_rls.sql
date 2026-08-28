ALTER TABLE public.field_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_registry_select_authenticated ON public.field_registry;
CREATE POLICY field_registry_select_authenticated
  ON public.field_registry FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.brain_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brain_values_select_members ON public.brain_values;
CREATE POLICY brain_values_select_members
  ON public.brain_values FOR SELECT TO authenticated
  USING (public.can_access_property(property_id));

DROP POLICY IF EXISTS brain_values_insert_editors ON public.brain_values;
CREATE POLICY brain_values_insert_editors
  ON public.brain_values FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_property(property_id));

DROP POLICY IF EXISTS brain_values_update_editors ON public.brain_values;
CREATE POLICY brain_values_update_editors
  ON public.brain_values FOR UPDATE TO authenticated
  USING (public.can_edit_property(property_id))
  WITH CHECK (public.can_edit_property(property_id));

DROP POLICY IF EXISTS brain_values_delete_editors ON public.brain_values;
CREATE POLICY brain_values_delete_editors
  ON public.brain_values FOR DELETE TO authenticated
  USING (public.can_edit_property(property_id));
