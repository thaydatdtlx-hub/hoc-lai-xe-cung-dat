-- Admin-controlled student handover. A non-destructive schema migration.
-- Existing records are not reassigned automatically; actions happen only on confirmed RPC calls.
-- Batch action preserves IDs, training history, tuition/payment records and deleted student archives.;

CREATE OR REPLACE FUNCTION public.app_list_users(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'created_at', u.created_at,
        'student_count', (select count(*) from public.students s where s.owner_id=u.id),
        'active_student_count', (select count(*) from public.students s where s.owner_id=u.id and s.deleted_at is null)
      )
      order by case when u.deleted_at is not null then 2 when u.role = 'admin' then 0 else 1 end, lower(u.username)
    )
    from public.app_users u
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.app_admin_transfer_students(
  p_token text,
  p_from_user_id text,
  p_to_user_id text,
  p_student_ids text[] default null,
  p_note text default ''
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_actor jsonb;
  v_from public.app_users%rowtype;
  v_to public.app_users%rowtype;
  v_count integer := 0;
  v_requested integer := 0;
  v_batch uuid := extensions.gen_random_uuid();
  v_note text := pg_catalog.btrim(coalesce(p_note,''));
begin
  -- Serialize account deletion/ownership handover operations.
  perform pg_catalog.pg_advisory_xact_lock(2100261123);
  v_actor := public.app_require_admin(p_token);
  if pg_catalog.length(v_note)>500 then
    raise exception 'Ghi chú bàn giao không được quá 500 ký tự.';
  end if;
  if pg_catalog.btrim(coalesce(p_from_user_id,''))=pg_catalog.btrim(coalesce(p_to_user_id,'')) then
    raise exception 'Người bàn giao và người tiếp nhận phải khác nhau.';
  end if;
  select * into v_from from public.app_users
    where id::text=pg_catalog.btrim(coalesce(p_from_user_id,'')) for share;
  if not found then raise exception 'Không tìm thấy tài khoản bàn giao.'; end if;
  select * into v_to from public.app_users
    where id::text=pg_catalog.btrim(coalesce(p_to_user_id,''))
      and active and deleted_at is null and role in ('admin','user') for share;
  if not found then raise exception 'Người tiếp nhận phải là Quản trị viên/Nhân viên đang hoạt động.'; end if;

  if p_student_ids is not null then
    v_requested := pg_catalog.cardinality(p_student_ids);
    if v_requested < 1 or v_requested > 500 then
      raise exception 'Hãy chọn từ 1 đến 500 học viên để bàn giao.';
    end if;
    if exists (
      select 1 from pg_catalog.unnest(p_student_ids) as item(sid)
      where item.sid is null or item.sid !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    ) then
      raise exception 'Danh sách học viên có mã không hợp lệ.';
    end if;
    if (select count(distinct sid) from pg_catalog.unnest(p_student_ids) as ids(sid))<>v_requested then
      raise exception 'Danh sách học viên bị trùng mã.';
    end if;
  end if;

  -- Only owner_id changes. Student ID, payments, attendance, class and
  -- training-session foreign keys remain unchanged. Deleted records are
  -- included when handing over ALL so they can still be restored later.
  with moved as (
    update public.students s set owner_id=v_to.id, updated_at=pg_catalog.now()
    where s.owner_id=v_from.id
      and (
        p_student_ids is null
        or (s.id::text=any(p_student_ids) and s.deleted_at is null)
      )
    returning s.id,s.student_code,s.name,s.deleted_at
  )
  insert into public.app_audit_logs (
    actor_id, actor_username, actor_role,
    action, entity_type, entity_id, entity_label, details
  )
  select
    (v_actor->>'id')::uuid,
    pg_catalog.left(v_actor->>'username',80),
    'admin','student_owner_transferred','student',moved.id::text,
    pg_catalog.left(moved.name,180),
    pg_catalog.jsonb_build_object(
      'batch_id',v_batch,
      'student_code',moved.student_code,
      'was_deleted',moved.deleted_at is not null,
      'from_owner_id',v_from.id,
      'from_username',coalesce(v_from.deleted_username,v_from.username),
      'to_owner_id',v_to.id,
      'to_username',v_to.username,
      'note',v_note
    )
  from moved;
  get diagnostics v_count = row_count;

  if v_count=0 then raise exception 'Không có hồ sơ phù hợp để bàn giao.'; end if;
  if p_student_ids is not null and v_count<>v_requested then
    raise exception 'Danh sách đã thay đổi hoặc có hồ sơ không thuộc tài khoản này. Vui lòng tải lại.';
  end if;

  return pg_catalog.jsonb_build_object(
    'batch_id',v_batch,
    'moved',v_count,
    'from_username',coalesce(v_from.deleted_username,v_from.username),
    'to_username',v_to.username,
    'includes_archived',p_student_ids is null
  );
end;
$function$;

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
      limit pg_catalog.greatest(1,pg_catalog.least(coalesce(p_limit,60),200))
    ) audit
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_admin_delete_manager(p_token text, p_user_id text, p_confirm_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if exists(select 1 from public.students s where s.owner_id=v_target.id) then
    raise exception 'Tài khoản vẫn còn hồ sơ học viên, kể cả trong Thùng rác. Hãy bàn giao toàn bộ trước khi xóa.';
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

CREATE OR REPLACE FUNCTION public.app_staff_save_student(p_token text, p_student_id text, p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me jsonb; v_owner uuid; v_id uuid; v_old uuid; v_name text; v_birth date;
begin
  v_me:=public.app_me(p_token);
  if v_me->>'role'<>'user' then raise exception 'Chỉ nhân viên sử dụng chức năng nhập hồ sơ này.'; end if;
  v_owner:=(v_me->>'id')::uuid;
  -- Lock the owner account while writing a student. A concurrent deletion
  -- waits until the student insert/modify finishes, then rechecks ownership.
  perform 1 from public.app_users u
  where u.id=v_owner and u.active and u.deleted_at is null
  for share;
  if not found then
    raise exception 'Tài khoản nhân viên đã bị khóa hoặc xóa.';
  end if;
  p_data:=coalesce(p_data,'{}'::jsonb);
  v_name:=pg_catalog.btrim(coalesce(p_data->>'name',''));
  if v_name='' or pg_catalog.length(v_name)>180 then raise exception 'Họ và tên không hợp lệ.'; end if;
  if pg_catalog.length(coalesce(p_data->>'notes',''))>30000 then raise exception 'Ghi chú quá dài.'; end if;
  v_birth:=nullif(pg_catalog.btrim(coalesce(p_data->>'date_of_birth','')),'')::date;
  if nullif(pg_catalog.btrim(coalesce(p_student_id,'')),'') is null then
    v_id:=extensions.gen_random_uuid();
    insert into public.students(id,student_code,owner_id,name,date_of_birth,cccd,phone,address,license_class,course,profile_status,notes,photo_data)
    values(v_id,'HV-2026-'||pg_catalog.lpad(pg_catalog.nextval('public.student_code_seq')::text,3,'0'),
      v_owner,v_name,v_birth,
      pg_catalog.btrim(coalesce(p_data->>'cccd','')),pg_catalog.btrim(coalesce(p_data->>'phone','')),
      pg_catalog.btrim(coalesce(p_data->>'address','')),
      coalesce(nullif(pg_catalog.btrim(coalesce(p_data->>'license_class','')),''),'B số tự động'),
      pg_catalog.btrim(coalesce(p_data->>'course','')),
      coalesce(nullif(pg_catalog.btrim(coalesce(p_data->>'profile_status','')),''),'Đã ghi nhận'),
      coalesce(p_data->>'notes',''),coalesce(p_data->>'photo_data',''));
  else
    select id into v_old from public.students where id::text=pg_catalog.btrim(p_student_id)
      and owner_id=v_owner and deleted_at is null for update;
    if v_old is null then raise exception 'Chỉ được sửa hồ sơ do chính tài khoản này nhập.'; end if;
    v_id:=v_old;
    update public.students set
      name=v_name,date_of_birth=v_birth,
      cccd=pg_catalog.btrim(coalesce(p_data->>'cccd','')),
      phone=pg_catalog.btrim(coalesce(p_data->>'phone','')),
      address=pg_catalog.btrim(coalesce(p_data->>'address','')),
      license_class=coalesce(nullif(pg_catalog.btrim(coalesce(p_data->>'license_class','')),''),'B số tự động'),
      course=pg_catalog.btrim(coalesce(p_data->>'course','')),
      profile_status=coalesce(nullif(pg_catalog.btrim(coalesce(p_data->>'profile_status','')),''),'Đã ghi nhận'),
      notes=coalesce(p_data->>'notes',''),photo_data=coalesce(p_data->>'photo_data',''),
      updated_at=pg_catalog.now()
    where id=v_id;
  end if;
  insert into public.app_audit_logs(actor_id,actor_username,actor_role,action,entity_type,entity_id,entity_label,details)
  values(v_owner,pg_catalog.left(v_me->>'username',80),'user',
    case when v_old is null then 'student_created' else 'student_updated' end,'student',v_id::text,
    pg_catalog.left(v_name,180),'{"scope":"own_student"}'::jsonb);
  return v_id::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_save_student(p_token text, p_student_id text, p_data jsonb, p_owner_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_me jsonb;
  v_id uuid;
  v_owner_id uuid;
  v_total numeric(14,0);
  v_paid numeric(14,0);
  v_date_of_birth date;
  v_code text;
begin
  v_me := public.app_me(p_token);
  if coalesce(v_me->>'role','') <> 'admin' then
    return public.app_staff_save_student(p_token,p_student_id,p_data);
  end if;
  p_data := coalesce(p_data, '{}'::jsonb);

  if btrim(coalesce(p_data->>'name', '')) = '' then
    raise exception 'Vui lòng nhập họ và tên.';
  end if;

  begin
    v_total := coalesce(nullif(p_data->>'tuition_total', '')::numeric, 0);
    v_paid := coalesce(nullif(p_data->>'paid', '')::numeric, 0);
  exception
    when invalid_text_representation then
      raise exception 'Học phí phải là số hợp lệ.';
  end;

  if v_total < 0 or v_paid < 0 then
    raise exception 'Học phí không được là số âm.';
  end if;
  if v_paid > v_total then
    raise exception 'Số tiền đã thu không được lớn hơn tổng học phí.';
  end if;

  begin
    v_date_of_birth := nullif(btrim(coalesce(p_data->>'date_of_birth', '')), '')::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Ngày sinh không hợp lệ.';
  end;

  if coalesce(v_me->>'role', '') = 'admin' then
    select id into v_owner_id
    from public.app_users
    where id::text = coalesce(
      nullif(btrim(coalesce(p_owner_id, '')), ''),
      v_me->>'id'
    )
      and active and deleted_at is null
    limit 1 for share;
  else
    v_owner_id := (v_me->>'id')::uuid;
  end if;

  if v_owner_id is null then
    raise exception 'Không tìm thấy tài khoản quản lý được giao.';
  end if;

  if nullif(btrim(coalesce(p_student_id, '')), '') is null then
    v_id := extensions.gen_random_uuid();
    v_code := 'HV-2026-' || lpad(nextval('public.student_code_seq')::text, 3, '0');

    insert into public.students(
      id,
      student_code,
      owner_id,
      name,
      date_of_birth,
      cccd,
      phone,
      address,
      license_class,
      course,
      training_center,
      exam_center,
      profile_status,
      online_status,
      cabin_status,
      dat_status,
      graduation_status,
      exam_status,
      tuition_total,
      paid,
      notes,
      photo_data
    )
    values (
      v_id,
      v_code,
      v_owner_id,
      btrim(p_data->>'name'),
      v_date_of_birth,
      btrim(coalesce(p_data->>'cccd', '')),
      btrim(coalesce(p_data->>'phone', '')),
      btrim(coalesce(p_data->>'address', '')),
      coalesce(nullif(btrim(p_data->>'license_class'), ''), 'B số tự động'),
      btrim(coalesce(p_data->>'course', '')),
      btrim(coalesce(p_data->>'training_center', '')),
      btrim(coalesce(p_data->>'exam_center', '')),
      coalesce(nullif(btrim(p_data->>'profile_status'), ''), 'Đã ghi nhận'),
      coalesce(nullif(btrim(p_data->>'online_status'), ''), 'Chưa hoàn thành'),
      coalesce(nullif(btrim(p_data->>'cabin_status'), ''), 'Chưa hoàn thành'),
      coalesce(nullif(btrim(p_data->>'dat_status'), ''), 'Chưa thực hiện'),
      coalesce(nullif(btrim(p_data->>'graduation_status'), ''), 'Chưa hoàn thành'),
      coalesce(nullif(btrim(p_data->>'exam_status'), ''), 'Chưa thi sát hạch'),
      v_total,
      v_paid,
      coalesce(p_data->>'notes', ''),
      coalesce(p_data->>'photo_data', '')
    );
  else
    update public.students
    set name = btrim(p_data->>'name'),
        date_of_birth = v_date_of_birth,
        cccd = btrim(coalesce(p_data->>'cccd', '')),
        phone = btrim(coalesce(p_data->>'phone', '')),
        address = btrim(coalesce(p_data->>'address', '')),
        license_class = coalesce(
          nullif(btrim(p_data->>'license_class'), ''),
          'B số tự động'
        ),
        course = btrim(coalesce(p_data->>'course', '')),
        training_center = case
          when p_data ? 'training_center' then btrim(coalesce(p_data->>'training_center', ''))
          else training_center
        end,
        exam_center = case
          when p_data ? 'exam_center' then btrim(coalesce(p_data->>'exam_center', ''))
          else exam_center
        end,
        profile_status = coalesce(
          nullif(btrim(p_data->>'profile_status'), ''),
          'Đã ghi nhận'
        ),
        online_status = coalesce(
          nullif(btrim(p_data->>'online_status'), ''),
          'Chưa hoàn thành'
        ),
        cabin_status = coalesce(
          nullif(btrim(p_data->>'cabin_status'), ''),
          'Chưa hoàn thành'
        ),
        dat_status = coalesce(
          nullif(btrim(p_data->>'dat_status'), ''),
          'Chưa thực hiện'
        ),
        graduation_status = coalesce(
          nullif(btrim(p_data->>'graduation_status'), ''),
          'Chưa hoàn thành'
        ),
        exam_status = coalesce(
          nullif(btrim(p_data->>'exam_status'), ''),
          'Chưa thi sát hạch'
        ),
        tuition_total = v_total,
        paid = v_paid,
        notes = coalesce(p_data->>'notes', ''),
        photo_data = coalesce(p_data->>'photo_data', ''),
        updated_at = now()
    where id::text = btrim(p_student_id)
      and (
        coalesce(v_me->>'role', '') = 'admin'
        or owner_id::text = v_me->>'id'
      )
    returning id into v_id;

    if v_id is null then
      raise exception 'Không tìm thấy học viên hoặc tài khoản không có quyền sửa.';
    end if;
  end if;

  return v_id::text;
end;
$function$;

revoke all on function public.app_admin_transfer_students(text,text,text,text[],text) from public;
grant execute on function public.app_admin_transfer_students(text,text,text,text[],text) to anon,authenticated;
revoke all on function public.app_admin_list_student_transfers(text,integer) from public;
grant execute on function public.app_admin_list_student_transfers(text,integer) to anon,authenticated;