-- Add an admin-only manager account editor, without altering existing user or student records.
-- All changes run under an existing validated manager session token.
create or replace function public.app_admin_update_manager(
  p_token text,
  p_user_id text,
  p_username text,
  p_role text,
  p_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb;
  v_actor_id uuid;
  v_target public.app_users%rowtype;
  v_username text;
  v_role text;
  v_password text;
begin
  v_actor := public.app_require_admin(p_token);
  v_actor_id := (v_actor->>'id')::uuid;
  -- Serialize role changes so two admins cannot concurrently remove each other.
  perform pg_catalog.pg_advisory_xact_lock(2100261123);
  select * into v_target
  from public.app_users
  where id::text = pg_catalog.btrim(pg_catalog.coalesce(p_user_id, ''))
  for update;
  if not found then
    raise exception 'Không tìm thấy tài khoản quản lý.';
  end if;

  v_username := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_username, '')));
  v_role := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_role, '')));
  v_password := pg_catalog.nullif(pg_catalog.coalesce(p_password, ''), '');

  if v_username !~ '^[a-z0-9._-]{4,40}$' then
    raise exception 'Tên đăng nhập gồm 4–40 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';
  end if;
  if v_role not in ('admin', 'user') then
    raise exception 'Phân quyền không hợp lệ.';
  end if;
  if v_password is not null and pg_catalog.length(v_password) < 8 then
    raise exception 'Mật khẩu mới phải có ít nhất 8 ký tự.';
  end if;

  if v_actor_id = v_target.id and v_role <> v_target.role then
    raise exception 'Không thể tự thay đổi quyền của tài khoản đang đăng nhập.';
  end if;
  if v_target.role = 'admin' and v_role <> 'admin'
    and (select pg_catalog.count(*) from public.app_users where role = 'admin' and active) <= 1 then
    raise exception 'Phải giữ ít nhất một tài khoản quản trị viên đang hoạt động.';
  end if;
  if v_target.role = 'admin' and v_password is not null then
    raise exception 'Đổi mật khẩu quản trị viên qua mục Đổi mật khẩu cá nhân.';
  end if;

  update public.app_users
  set username = v_username,
      role = v_role,
      password_hash = case
        when v_password is null then password_hash
        else extensions.crypt(v_password, extensions.gen_salt('bf', 12))
      end,
      force_change_password = case
        when v_password is null then force_change_password
        else true
      end,
      updated_at = pg_catalog.now()
  where id = v_target.id;

  -- Force a fresh login after role or password changes (including promotion).
  if v_role <> v_target.role or v_password is not null then
    delete from public.app_sessions where user_id = v_target.id;
  end if;

  insert into public.app_audit_logs(
    actor_id, actor_username, actor_role, action,
    entity_type, entity_id, entity_label, details
  )
  values(
    v_actor_id,
    pg_catalog.left(v_actor->>'username', 80),
    'admin',
    'manager_updated',
    'manager',
    v_target.id::text,
    pg_catalog.left(v_username, 180),
    pg_catalog.jsonb_build_object(
      'old_username', v_target.username,
      'new_username', v_username,
      'old_role', v_target.role,
      'new_role', v_role,
      'password_reset', v_password is not null
    )
  );

  return pg_catalog.jsonb_build_object(
    'id', v_target.id,
    'username', v_username,
    'role', v_role,
    'active', v_target.active
  );
exception
  when unique_violation then
    raise exception 'Tên đăng nhập này đã được sử dụng.';
end;
$function$;

-- Calls are available to the site's publishable-key client, but they MUST pass
-- an active app admin session token checked inside the SECURITY DEFINER function.
revoke all on function public.app_admin_update_manager(text,text,text,text,text) from public;
grant execute on function public.app_admin_update_manager(text,text,text,text,text) to anon, authenticated;
comment on function public.app_admin_update_manager(text,text,text,text,text)
is 'Update an existing manager username/role and optionally reset a non-admin password; requires app_require_admin session token. Preserves user IDs and linked records.';
