-- Staff-owned records only. Admin controls accounts, fees, deletion, and global schedules.


CREATE OR REPLACE FUNCTION public.app_list_students(p_token text, p_owner_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_me jsonb;
begin
  v_me := public.app_me(p_token);

  return coalesce((
    select jsonb_agg(
      (case when coalesce(v_me->>'role','')='admin' then to_jsonb(student) else to_jsonb(student)-'tuition_total'-'paid' end)
      || jsonb_build_object('owner_username', owner_user.username)
      order by student.created_at desc, student.student_code desc
    )
    from public.students student
    join public.app_users owner_user on owner_user.id = student.owner_id
    where student.deleted_at is null
      and (
        (
          coalesce(v_me->>'role', '') = 'admin'
          and (
            nullif(btrim(coalesce(p_owner_id, '')), '') is null
            or student.owner_id::text = btrim(p_owner_id)
          )
        )
        or (
          coalesce(v_me->>'role', '') <> 'admin'
          and student.owner_id::text = v_me->>'id'
        )
      )
  ), '[]'::jsonb);
end;
$function$


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
  if coalesce(v_me->>'role','') <> 'admin' then raise exception 'Nhân viên nhập hồ sơ qua chức năng dành riêng cho nhân viên.'; end if;
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
    limit 1;
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
$function$


CREATE OR REPLACE FUNCTION public.app_delete_student(p_token text, p_student_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_me jsonb;
  v_student public.students;
  v_account_active boolean;
begin
  v_me := public.app_me(p_token);
  if coalesce(v_me->>'role','') <> 'admin' then raise exception 'Chỉ quản trị viên được xóa hồ sơ học viên.'; end if;

  select * into v_student
  from public.students
  where id::text = btrim(coalesce(p_student_id, ''))
    and deleted_at is null;

  if v_student.id is null then
    raise exception 'Không tìm thấy hồ sơ học viên.';
  end if;
  if coalesce(v_me->>'role', '') <> 'admin'
     and v_student.owner_id::text <> v_me->>'id' then
    raise exception 'Tài khoản không có quyền xóa học viên này.';
  end if;

  select active into v_account_active
  from public.app_student_accounts
  where student_id = v_student.id::text;

  update public.students
  set deleted_at = now(),
      deleted_by = nullif(v_me->>'id', '')::uuid,
      deleted_account_was_active = v_account_active,
      updated_at = now()
  where id = v_student.id;

  update public.app_student_accounts
  set active = false, updated_at = now()
  where student_id = v_student.id::text;

  delete from public.app_student_sessions session
  using public.app_student_accounts account
  where session.account_id = account.id
    and account.student_id = v_student.id::text;

  perform public.app_record_audit(
    p_token,
    'student_moved_to_trash',
    'student',
    v_student.id::text,
    v_student.name,
    jsonb_build_object('student_code', v_student.student_code)
  );

  return true;
end;
$function$


create or replace function public.app_staff_save_student(p_token text,p_student_id text,p_data jsonb)
returns text language plpgsql security definer set search_path = ''
as $f$
declare v_me jsonb; v_owner uuid; v_id uuid; v_old uuid; v_name text; v_birth date;
begin
  v_me:=public.app_me(p_token);
  if v_me->>'role'<>'user' then raise exception 'Chỉ nhân viên sử dụng chức năng nhập hồ sơ này.'; end if;
  v_owner:=(v_me->>'id')::uuid;
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
$f$;

create or replace function public.app_staff_save_student_schedule(p_token text,p_student_id text,p_notes text)
returns boolean language plpgsql security definer set search_path = ''
as $f$
declare v_me jsonb; v_id uuid; v_name text;
begin
  v_me:=public.app_me(p_token);
  if v_me->>'role'<>'user' then raise exception 'Chỉ nhân viên sử dụng chức năng lập lịch riêng này.'; end if;
  if pg_catalog.length(coalesce(p_notes,''))>30000 then raise exception 'Nội dung lịch quá dài.'; end if;
  select id,name into v_id,v_name from public.students
  where id::text=pg_catalog.btrim(coalesce(p_student_id,'')) and owner_id=(v_me->>'id')::uuid
    and deleted_at is null for update;
  if v_id is null then raise exception 'Chỉ được quản lý lịch của học viên do tài khoản này nhập.'; end if;
  update public.students set notes=coalesce(p_notes,''),updated_at=pg_catalog.now() where id=v_id;
  insert into public.app_audit_logs(actor_id,actor_username,actor_role,action,entity_type,entity_id,entity_label,details)
  values((v_me->>'id')::uuid,pg_catalog.left(v_me->>'username',80),'user','schedule_changed',
    'student',v_id::text,pg_catalog.left(v_name,180),'{"scope":"own_student","type":"milestones"}'::jsonb);
  return true;
end;
$f$;

create or replace function public.app_staff_save_training_session(
p_token text,p_session_id text,p_student_id text,p_session_type text,p_starts_at text,p_location text,p_note text)
returns text language plpgsql security definer set search_path = ''
as $f$
declare v_me jsonb; v_owner uuid; v_sid uuid; v_id uuid; v_previous public.student_training_sessions%rowtype; v_at timestamptz;
begin
  v_me:=public.app_me(p_token);
  if v_me->>'role'<>'user' then raise exception 'Chỉ nhân viên sử dụng chức năng lập buổi riêng này.'; end if;
  v_owner:=(v_me->>'id')::uuid;
  if coalesce(p_session_type,'') not in ('familiar','dat_practice','practice') then raise exception 'Nội dung ca học không hợp lệ.'; end if;
  select id into v_sid from public.students
  where id::text=pg_catalog.btrim(coalesce(p_student_id,'')) and owner_id=v_owner and deleted_at is null;
  if v_sid is null then raise exception 'Chỉ được xếp lịch cho học viên do chính tài khoản này nhập.'; end if;
  v_at:=pg_catalog.btrim(coalesce(p_starts_at,''))::timestamptz;
  if v_at is null then raise exception 'Thiếu ngày giờ đào tạo.'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_session_id,'')),'') is null then
    insert into public.student_training_sessions(student_id,session_type,starts_at,location,note)
    values(v_sid,p_session_type,v_at,pg_catalog.left(pg_catalog.btrim(coalesce(p_location,'')),250),
      pg_catalog.left(pg_catalog.btrim(coalesce(p_note,'')),500)) returning id into v_id;
  else
    select ses.* into v_previous from public.student_training_sessions ses
    join public.students s on s.id=ses.student_id
    where ses.id::text=pg_catalog.btrim(p_session_id) and s.owner_id=v_owner and s.deleted_at is null
    for update of ses;
    if v_previous.id is null then raise exception 'Chỉ được sửa ca học thuộc học viên của mình.'; end if;
    if v_previous.slot_id is not null then raise exception 'Chỉ quản trị viên sửa ca học chung.'; end if;
    v_id:=v_previous.id;
    update public.student_training_sessions set student_id=v_sid,session_type=p_session_type,starts_at=v_at,
      location=pg_catalog.left(pg_catalog.btrim(coalesce(p_location,'')),250),
      note=pg_catalog.left(pg_catalog.btrim(coalesce(p_note,'')),500),updated_at=pg_catalog.now()
    where id=v_id;
  end if;
  insert into public.app_audit_logs(actor_id,actor_username,actor_role,action,entity_type,entity_id,entity_label,details)
  values(v_owner,pg_catalog.left(v_me->>'username',80),'user','schedule_changed','training_session',
    v_id::text,'Buổi học riêng',pg_catalog.jsonb_build_object('scope','own_student','student_id',v_sid));
  return v_id::text;
end;
$f$;

create or replace function public.app_staff_delete_training_session(p_token text,p_session_id text)
returns boolean language plpgsql security definer set search_path = ''
as $f$
declare v_me jsonb; v_previous public.student_training_sessions%rowtype;
begin
  v_me:=public.app_me(p_token);
  if v_me->>'role'<>'user' then raise exception 'Chỉ nhân viên sử dụng chức năng xóa buổi riêng này.'; end if;
  select ses.* into v_previous from public.student_training_sessions ses
  join public.students s on s.id=ses.student_id
  where ses.id::text=pg_catalog.btrim(coalesce(p_session_id,'')) and s.owner_id=(v_me->>'id')::uuid
    and s.deleted_at is null for update of ses;
  if v_previous.id is null then raise exception 'Chỉ được xóa ca học thuộc học viên của mình.'; end if;
  if v_previous.slot_id is not null then raise exception 'Chỉ quản trị viên thay đổi ca học chung.'; end if;
  if exists(select 1 from public.app_attendance_records where training_session_id=v_previous.id) then
    raise exception 'Buổi học đã có dữ liệu điểm danh, không được xóa.';
  end if;
  delete from public.student_training_sessions where id=v_previous.id;
  insert into public.app_audit_logs(actor_id,actor_username,actor_role,action,entity_type,entity_id,entity_label,details)
  values((v_me->>'id')::uuid,pg_catalog.left(v_me->>'username',80),'user','schedule_changed',
    'training_session',v_previous.id::text,'Xóa buổi học riêng',
    pg_catalog.jsonb_build_object('scope','own_student','student_id',v_previous.student_id));
  return true;
end;
$f$;

revoke all on function public.app_staff_save_student(text,text,jsonb) from public;
grant execute on function public.app_staff_save_student(text,text,jsonb) to anon, authenticated;

revoke all on function public.app_staff_save_student_schedule(text,text,text) from public;
grant execute on function public.app_staff_save_student_schedule(text,text,text) to anon, authenticated;

revoke all on function public.app_staff_save_training_session(text,text,text,text,text,text,text) from public;
grant execute on function public.app_staff_save_training_session(text,text,text,text,text,text,text) to anon, authenticated;

revoke all on function public.app_staff_delete_training_session(text,text) from public;
grant execute on function public.app_staff_delete_training_session(text,text) to anon, authenticated;