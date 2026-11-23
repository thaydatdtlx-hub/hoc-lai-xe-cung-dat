create or replace function public.app_admin_list_student_transfers(
  p_token text, p_limit integer default 60
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
begin
  perform public.app_require_admin(p_token);
  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',audit.id,
        'student_id',audit.entity_id,
        'student_name',audit.entity_label,
        'actor_username',audit.actor_username,
        'created_at',audit.created_at,
        'details',audit.details
      ) order by audit.created_at desc,audit.id desc
    )
    from (
      select id,entity_id,entity_label,actor_username,created_at,details
      from public.app_audit_logs
      where action='student_owner_transferred'
        and entity_type='student'
      order by created_at desc,id desc
      limit greatest(1,least(coalesce(p_limit,60),200))
    ) audit
  ), '[]'::jsonb);
end;
$function$;