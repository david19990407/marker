-- =============================================================================
-- Phase 6: MCQ option text is canonical; identifiers are display-only
-- Safe for live databases. Does NOT rerun full schema.sql.
-- =============================================================================

-- Ensure choices objects expose a `text` field mirrored from legacy `label`.
-- Does not invent correct answers. Does not modify non-object choice arrays
-- beyond promoting string arrays via the existing repair helper when present.

create or replace function public.repair_mcq_choices_payload(p_choices jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_idx int := 0;
  v_label text;
  v_text text;
  v_id text;
  v_correct boolean;
  v_feedback text;
begin
  if p_choices is null or jsonb_typeof(p_choices) <> 'array' then
    return '[]'::jsonb;
  end if;

  for v_item in select * from jsonb_array_elements(p_choices)
  loop
    if jsonb_typeof(v_item) = 'string' then
      v_text := v_item #>> '{}';
      v_label := v_text;
      v_id := 'opt-' || v_idx::text;
      v_correct := false;
      v_feedback := '';
    elsif jsonb_typeof(v_item) = 'object' then
      v_text := coalesce(
        nullif(v_item ->> 'text', ''),
        nullif(v_item ->> 'label', ''),
        ''
      );
      v_label := v_text;
      v_id := coalesce(
        nullif(v_item ->> 'id', ''),
        'opt-' || v_idx::text
      );
      v_correct := coalesce(
        (v_item ->> 'is_correct')::boolean,
        (v_item ->> 'correct')::boolean,
        false
      );
      v_feedback := coalesce(v_item ->> 'feedback', '');

      -- Heal "Option A" label with answer typed into feedback.
      if v_feedback <> ''
         and (
           v_text = ''
           or v_text ~* '^Option[[:space:]]+[A-Z0-9]+$'
         )
      then
        v_text := v_feedback;
        v_label := v_feedback;
        v_feedback := '';
      end if;
    else
      v_idx := v_idx + 1;
      continue;
    end if;

    v_out := v_out || jsonb_build_array(
      jsonb_build_object(
        'id', v_id,
        'text', v_text,
        'label', v_label,
        'feedback', v_feedback,
        'is_correct', v_correct
      )
    );
    v_idx := v_idx + 1;
  end loop;

  return v_out;
end;
$$;

update public.assignment_questions q
set choices = public.repair_mcq_choices_payload(q.choices)
where q.response_type in ('multiple_choice', 'multiple_select')
  and q.choices is not null
  and jsonb_typeof(q.choices) = 'array'
  and jsonb_array_length(q.choices) > 0;

-- Default option label style on blocks that lack one.
update public.assignment_blocks b
set config = coalesce(b.config, '{}'::jsonb) || jsonb_build_object('option_label_style', 'letters')
where b.block_type in ('multiple_choice', 'multiple_select')
  and (
    b.config is null
    or b.config ->> 'option_label_style' is null
  );

notify pgrst, 'reload schema';
