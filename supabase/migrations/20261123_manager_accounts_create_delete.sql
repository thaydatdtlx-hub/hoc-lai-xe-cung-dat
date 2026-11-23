-- Add secure create + reversible-data deletion of manager accounts (users and admins).
-- The manager row remains so student ownership and financial/audit foreign keys are intact.
alter table public.app_users
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_username text;

comment on column public.app_users.deleted_at is 'Logical deletion timestamp: revoked login and hidden from active manager list; linked history retained.';
comment on column public.app_users.deleted_username is 'Historical original username before logical deletion.';

create or replace function public.app_list_users(p_token text)
returns jsonb language plpgsql security definer
set search_path = ''
as $function$
begin
  perform public.app_require_admin(p_token);
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'username', case when u.deleted_at is not null then coalesce(u.deleted_username, u.username) else u.username end,
        'role', u.role,
        'active', u.active,
        'deleted_at', u.deleted_at,
        'force_change_password', u.force_change_password,
        'created_at', u.created_at
      )
      order by case when u.deleted_at is not null then 2 when u.role = 'admin' then 0 else 1 end, lower(u.username)
    )
    from public.app_users u
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.app_admin_create_manager(
  p_token text, p_username text, p_password text, p_role text
)
returns jsonb language plpgsql security definer
set search_path = ''
as $function$
declare
  v_actor jsonb;
  v_username text;
  v_role text;
  v_id uuid;
begin
  -- Keep authorization decisions consistent with concurrent admin changes.
  perform pg_catalog.pg_advisory_xact_lock(2100261123);
  v_actor := public.app_require_admin(p_token);
  v_username := pg_catalog.lower(pg_catalog.btrim(coalesce(p_username,'')));
  v_role := pg_catalog.lower(pg_catalog.btrim(coalesce(p_role,'')));

  if v_username !~ '^[a-z0-9._-]{4,40}$' then
    raise exception 'Tên đăng nhập gồm 4–40 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';
  end if;
  if pg_catalog.length(coalesce(p_password,'')) < 8 then
    raise exception 'Mật khẩu tạm phải có ít nhất 8 ký tự.';
  end if;
  if v_role not in ('admin','user') then
    raise exception 'Vai trò không hợp lệ.';
  end if;

  insert into public.app_users(username,password_hash,role,active,force_change_password)
  values(v_username,extensions.crypt(p_password,extensions.gen_salt('bf',12)),v_role,true,true)
  returning id into v_id;

  insert into public.app_audit_logs(
    actor_id,actor_username,actor_role,action,entity_type,entity_id,entity_label,details
  ) values (
    (v_actor->>'id')::uuid,
    pg_catalog.left(v_actor->>'username',80), 'admin',
    'manager_created','manager',v_id::text,v_username,
    pg_catalog.jsonb_build_object('role',v_role)
  );

  return pg_catalog.jsonb_build_object('id',v_id,'username',v_username,'role',v_role,'active',true);
exception when unique_violation then
  raise exception 'Tên đăng nhập này đã được sử dụng.';
end;
$function$;

create or replace function public.app_admin_delete_manager(
  p_token text, p_user_id text, p_confirm_username text
)
returns jsonb language plpgsql security definer
set search_path = ''
as $function$
declare
  v_actor jsonb;
  v_target public.app_users%rowtype;
  v_deleted_name text;
begin
  perform pg_catalog.pg_advisory_xact_lock(2100261123);
  v_actor := public.app_require_admin(p_token);

  select * into v_target
  from public.app_users
  where id::text = pg_catalog.btrim(coalesce(p_user_id,'')) and deleted_at is null
  for update;
  if not found then
    raise exception 'Tài khoản không tồn tại hoặc đã được xóa.';
  end if;
  if v_target.id = (v_actor->>'id')::uuid then
    raise exception 'Không thể xóa tài khoản đang đăng nhập.';
  end if;
  if pg_catalog.lower(pg_catalog.btrim(coalesce(p_confirm_username,''))) <> v_target.username then
    raise exception 'Tên đăng nhập xác nhận không đúng.';
  end if;
  if v_target.role = 'admin' and
     (select pg_catalog.count(*) from public.app_users where role='admin' and active and deleted_at is null) <= 1 then
    raise exception 'Không thể xóa quản trị viên cuối cùng.';
  end if;

  -- Use a stable tombstone account ID to preserve owner and audit FKs,
  -- while releasing the former username for future registration.
  v_deleted_name := 'deleted_' || pg_catalog.replace(v_target.id::text,'-','');
  update public.app_users
  set deleted_at=pg_catalog.now(),
      deleted_username=v_target.username,
      username=v_deleted_name,
      active=false,
      password_hash=extensions.crypt(
        pg_catalog.encode(extensions.gen_random_bytes(32),'hex'),
        extensions.gen_salt('bf',12)
      ),
      updated_at=pg_catalog.now()
  where id=v_target.id;

  delete from public.app_sessions where user_id=v_target.id;

  insert into public.app_audit_logs(
    actor_id,actor_username,actor_role,action,entity_type,entity_id,entity_label,details
  ) values (
    (v_actor->>'id')::uuid,
    pg_catalog.left(v_actor->>'username',80), 'admin',
    'manager_deleted','manager',v_target.id::text,
    pg_catalog.left(v_target.username,180),
    pg_catalog.jsonb_build_object('role',v_target.role,'deletion_type','soft','retains_linked_records',true)
  );

  return pg_catalog.jsonb_build_object(
    'deleted',true,'id',v_target.id,'username',v_target.username,'role',v_target.role
  );
end;
$function$;

create or replace function public.app_set_user_active(p_token text,p_user_id text,p_active boolean)
returns boolean language plpgsql security definer
set search_path = ''
as $function$
declare
  v_role text;
begin
  perform public.app_require_admin(p_token);
  select role into v_role from public.app_users
  where id::text = pg_catalog.btrim(coalesce(p_user_id,'')) and deleted_at is null;
  if v_role is null then
    raise exception 'Tài khoản không tồn tại hoặc đã được xóa.';
  end if;
  if v_role = 'admin' then
    raise exception 'Không thể khóa tài khoản admin.';
  end if;
  update public.app_users
  set active = coalesce(p_active,false), updated_at = pg_catalog.now()
  where id::text = pg_catalog.btrim(coalesce(p_user_id,'')) and deleted_at is null;
  if not coalesce(p_active,false) then
    delete from public.app_sessions where user_id::text = pg_catalog.btrim(coalesce(p_user_id,''));
  end if;
  return true;
end;
$function$;

create or replace function public.app_admin_reset_password(p_token text,p_user_id text,p_password text)
returns boolean language plpgsql security definer
set search_path = ''
as $function$
declare
  v_target public.app_users%rowtype;
begin
  perform public.app_require_admin(p_token);
  if pg_catalog.length(coalesce(p_password,'')) < 8 then
    raise exception 'Mật khẩu tạm phải có ít nhất 8 ký tự.';
  end if;
  select * into v_target from public.app_users
  where id::text = pg_catalog.btrim(coalesce(p_user_id,'')) and deleted_at is null
  for update;
  if not found then
    raise exception 'Tài khoản không tồn tại hoặc đã được xóa.';
  end if;
  if v_target.role = 'admin' then
    raise exception 'Quản trị viên phải đổi mật khẩu qua mục Đổi mật khẩu cá nhân.';
  end if;
  update public.app_users set
    password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)),
    force_change_password=true,active=true,updated_at=pg_catalog.now()
  where id = v_target.id;
  delete from public.app_sessions where user_id=v_target.id;
  return true;
end;
$function$;

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
  -- Admin account changes use the same lock; recheck caller permission after locking.
  perform pg_catalog.pg_advisory_xact_lock(2100261123);
  v_actor := public.app_require_admin(p_token);
  v_actor_id := (v_actor->>'id')::uuid;
  select * into v_target
  from public.app_users
  where id::text = pg_catalog.btrim(coalesce(p_user_id, '')) and deleted_at is null
  for update;
  if not found then
    raise exception 'Không tìm thấy tài khoản quản lý.';
  end if;

  v_username := pg_catalog.lower(pg_catalog.btrim(coalesce(p_username, '')));
  v_role := pg_catalog.lower(pg_catalog.btrim(coalesce(p_role, '')));
  v_password := nullif(coalesce(p_password, ''), '');

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
    and (select pg_catalog.count(*) from public.app_users where role = 'admin' and active and deleted_at is null) <= 1 then
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


revoke all on function public.app_admin_create_manager(text,text,text,text) from public;
grant execute on function public.app_admin_create_manager(text,text,text,text) to anon, authenticated;
revoke all on function public.app_admin_delete_manager(text,text,text) from public;
grant execute on function public.app_admin_delete_manager(text,text,text) to anon, authenticated;
-- Existing calls remain subject to the server-side admin token checks.
