-- Enforce A1/A exam-only scheduling and prevent mixed car/motorcycle course updates.
-- No student records are changed by applying this migration.
-- Pure predicate shared by admin and staff server-side schedule checks.
create or replace function private.app_is_motorcycle_license(p_license text)
returns boolean language sql immutable
set search_path = ''
as $function$
  select regexp_replace(lower(btrim(coalesce(p_license,''))),'[^a-z0-9]+',' ','g') ~ '(^| )(a1|a)( |$)'
$function$;

CREATE OR REPLACE FUNCTION private.app_merge_course_schedule(p_notes text, p_schedule jsonb, p_license_class text, p_course_key text, p_course_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_clean text := private.app_strip_student_schedule(p_notes);
  v_existing jsonb := public.app_schedule_payload(p_notes);
  v_existing_dates jsonb;
  v_existing_locations jsonb;
  v_course_dates jsonb;
  v_course_locations jsonb;
  v_personal_dates jsonb;
  v_personal_locations jsonb;
  v_dates jsonb;
  v_locations jsonb;
  v_payload jsonb;
  v_note text;
  v_license text := lower(btrim(coalesce(p_license_class, '')));
begin
  v_existing_dates := case when jsonb_typeof(v_existing->'dates') = 'object' then v_existing->'dates' else '{}'::jsonb end;
  v_existing_locations := case when jsonb_typeof(v_existing->'locations') = 'object' then v_existing->'locations' else '{}'::jsonb end;

  v_personal_dates := private.app_pick_jsonb_text(
    v_existing_dates,
    array['familiar', 'dat_practice', 'practice']
  );
  v_personal_locations := private.app_pick_jsonb_text(
    v_existing_locations,
    array['familiar', 'dat_practice', 'practice']
  );

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_personal_locations
  from jsonb_each(v_personal_locations) as item
  where v_personal_dates ? item.key;

  v_course_dates := private.app_pick_jsonb_text(
    p_schedule->'dates',
    array[
      'online_start', 'online_end', 'cabin',
      'dat_auto_start', 'dat_auto_end',
      'dat_manual_start', 'dat_manual_end',
      'graduation', 'exam'
    ]
  );
  v_course_locations := private.app_pick_jsonb_text(
    p_schedule->'locations',
    array[
      'online_start', 'online_end', 'cabin',
      'dat_auto_start', 'dat_auto_end',
      'dat_manual_start', 'dat_manual_end',
      'graduation', 'exam'
    ]
  );

  if v_license like '%số tự động%' then
    v_course_dates := v_course_dates - array['dat_manual_start', 'dat_manual_end']::text[];
    v_course_locations := v_course_locations - array['dat_manual_start', 'dat_manual_end']::text[];
  elsif v_license like '%số cơ khí%' then
    null;
  else
    v_course_dates := v_course_dates - array['dat_auto_start', 'dat_auto_end', 'dat_manual_start', 'dat_manual_end']::text[];
    v_course_locations := v_course_locations - array['dat_auto_start', 'dat_auto_end', 'dat_manual_start', 'dat_manual_end']::text[];
  end if;

  if private.app_is_motorcycle_license(p_license_class) then
    -- Preserve any legacy car milestones as hidden history, without creating
    -- or changing them when a motorcycle course exam is saved.
    v_personal_dates := v_existing_dates - 'exam';
    v_personal_locations := v_existing_locations - 'exam';
    v_course_dates := private.app_pick_jsonb_text(v_course_dates, array['exam']);
    v_course_locations := private.app_pick_jsonb_text(v_course_locations, array['exam']);
  end if;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_course_locations
  from jsonb_each(v_course_locations) as item
  where v_course_dates ? item.key;

  v_dates := coalesce(v_personal_dates, '{}'::jsonb) || coalesce(v_course_dates, '{}'::jsonb);
  v_locations := coalesce(v_personal_locations, '{}'::jsonb) || coalesce(v_course_locations, '{}'::jsonb);
  v_note := left(btrim(coalesce(p_schedule->>'note', '')), 1000);

  if v_dates = '{}'::jsonb and v_note = '' then
    return v_clean;
  end if;

  v_payload := jsonb_build_object(
    'version', 2,
    'source', case when coalesce(private.app_course_key(p_course_key), '') = '' then 'personal' else 'course' end,
    'courseKey', private.app_course_key(p_course_key),
    'courseName', btrim(coalesce(p_course_name, '')),
    'dates', v_dates,
    'locations', v_locations,
    'note', v_note,
    'updatedAt', coalesce(nullif(p_schedule->>'updatedAt', ''), to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );

  return case when v_clean = '' then '' else v_clean || E'\n\n' end || private.app_schedule_token(v_payload);
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_admin_save_course_schedule(p_token text, p_course text, p_schedule jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_me jsonb;
  v_course_key text;
  v_course_name text;
  v_member_count integer;
  v_motorcycle_count integer := 0;
  v_updated_count integer := 0;
  v_dates jsonb;
  v_locations jsonb;
  v_schedule jsonb;
  v_note text;
begin
  v_me := public.app_require_admin(p_token);
  v_course_key := private.app_course_key(p_course);

  if v_course_key = '' then
    raise exception 'Vui lòng chọn khóa học.';
  end if;
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'object' then
    raise exception 'Dữ liệu lịch đào tạo chưa hợp lệ.';
  end if;

  select min(btrim(student.course)), count(*)::integer,
         count(*) filter(where private.app_is_motorcycle_license(student.license_class))::integer
  into v_course_name, v_member_count, v_motorcycle_count
  from public.students as student
  where student.deleted_at is null
    and private.app_course_key(student.course) = v_course_key;

  if coalesce(v_member_count, 0) = 0 then
    raise exception 'Không tìm thấy học viên trong khóa học này.';
  end if;
  if v_motorcycle_count > 0 and v_motorcycle_count < v_member_count then
    raise exception 'Khóa có cả A1/A và B/C1. Vui lòng tách khóa xe máy và khóa ô tô để lập lịch đúng hạng.';
  end if;

  v_dates := private.app_pick_jsonb_text(
    p_schedule->'dates',
    array[
      'online_start', 'online_end', 'cabin',
      'dat_auto_start', 'dat_auto_end',
      'dat_manual_start', 'dat_manual_end',
      'graduation', 'exam'
    ]
  );
  v_locations := private.app_pick_jsonb_text(
    p_schedule->'locations',
    array[
      'online_start', 'online_end', 'cabin',
      'dat_auto_start', 'dat_auto_end',
      'dat_manual_start', 'dat_manual_end',
      'graduation', 'exam'
    ]
  );

  if v_dates = '{}'::jsonb then
    raise exception 'Vui lòng nhập ít nhất một mốc đào tạo.';
  end if;
  if v_motorcycle_count = v_member_count then
    if not (v_dates ? 'exam') or (v_dates - 'exam') <> '{}'::jsonb then
      raise exception 'Khóa học A1/A chỉ được lập lịch Thi sát hạch.';
    end if;
    if nullif(btrim(coalesce(v_locations->>'exam','')),'') is null then
      raise exception 'Vui lòng nhập Địa điểm / hình thức Thi sát hạch.';
    end if;
    if (v_dates->>'exam') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}' then
      raise exception 'Vui lòng nhập Ngày và giờ Thi sát hạch hợp lệ.';
    end if;
  end if;

  if (v_dates ? 'online_start') <> (v_dates ? 'online_end') then
    raise exception 'Vui lòng nhập đủ ngày bắt đầu và kết thúc lý thuyết online.';
  end if;
  if (v_dates ? 'dat_auto_start') <> (v_dates ? 'dat_auto_end') then
    raise exception 'Vui lòng nhập đủ ngày bắt đầu và kết thúc DAT số tự động.';
  end if;
  if (v_dates ? 'dat_manual_start') <> (v_dates ? 'dat_manual_end') then
    raise exception 'Vui lòng nhập đủ ngày bắt đầu và kết thúc DAT số cơ khí.';
  end if;

  begin
    if v_dates ? 'online_start' and (v_dates->>'online_end')::date < (v_dates->>'online_start')::date then
      raise exception 'Ngày kết thúc lý thuyết online không được trước ngày bắt đầu.';
    end if;
    if v_dates ? 'dat_auto_start' and (v_dates->>'dat_auto_end')::timestamp < (v_dates->>'dat_auto_start')::timestamp then
      raise exception 'Ngày kết thúc DAT số tự động không được trước ngày bắt đầu.';
    end if;
    if v_dates ? 'dat_manual_start' and (v_dates->>'dat_manual_end')::timestamp < (v_dates->>'dat_manual_start')::timestamp then
      raise exception 'Ngày kết thúc DAT số cơ khí không được trước ngày bắt đầu.';
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Một hoặc nhiều ngày trong lịch đào tạo chưa đúng định dạng.';
  end;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_locations
  from jsonb_each(v_locations) as item
  where v_dates ? item.key;

  v_note := left(btrim(coalesce(p_schedule->>'note', '')), 1000);
  v_schedule := jsonb_build_object(
    'version', 2,
    'source', 'course',
    'courseKey', v_course_key,
    'courseName', v_course_name,
    'dates', v_dates,
    'locations', v_locations,
    'note', v_note,
    'updatedAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  insert into private.app_course_schedules(
    course_key, course_name, schedule, updated_by, created_at, updated_at
  ) values (
    v_course_key, v_course_name, v_schedule, (v_me->>'id')::uuid, now(), now()
  )
  on conflict (course_key) do update
  set course_name = excluded.course_name,
      schedule = excluded.schedule,
      updated_by = excluded.updated_by,
      updated_at = now();

  with desired as (
    select
      student.id,
      private.app_merge_course_schedule(
        student.notes,
        v_schedule,
        student.license_class,
        v_course_key,
        v_course_name
      ) as new_notes
    from public.students as student
    where student.deleted_at is null
      and private.app_course_key(student.course) = v_course_key
  ), updated as (
    update public.students as student
    set notes = desired.new_notes,
        updated_at = now()
    from desired
    where student.id = desired.id
      and student.notes is distinct from desired.new_notes
    returning student.id
  )
  select count(*)::integer into v_updated_count from updated;

  return jsonb_build_object(
    'course_key', v_course_key,
    'course', v_course_name,
    'student_count', v_member_count,
    'updated_count', v_updated_count,
    'schedule', v_schedule
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_admin_save_student_schedule(p_token text, p_student_id text, p_notes text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_student public.students;
  v_schedule jsonb;
  v_old_notes text;
  v_license text;
  v_old jsonb;
  v_new jsonb;
begin
  perform public.app_require_admin(p_token);

  select * into v_student
  from public.students
  where id::text = btrim(coalesce(p_student_id, ''))
    and deleted_at is null;

  if not found then
    raise exception 'Không tìm thấy hồ sơ học viên.';
  end if;

  if private.app_course_key(v_student.course) <> '' then
    v_schedule := public.app_schedule_payload(p_notes);
    if v_schedule = '{}'::jsonb then
      perform public.app_admin_delete_course_schedule(p_token, v_student.course);
    else
      perform public.app_admin_save_course_schedule(p_token, v_student.course, v_schedule);
    end if;
    return true;
  end if;

  v_license := v_student.license_class;
  v_old_notes := v_student.notes;
  if private.app_is_motorcycle_license(v_license) then
    v_old := public.app_schedule_payload(v_old_notes);
    v_new := public.app_schedule_payload(p_notes);
    if (coalesce(v_old->'dates','{}'::jsonb) - 'exam')
         is distinct from (coalesce(v_new->'dates','{}'::jsonb) - 'exam')
      or (coalesce(v_old->'locations','{}'::jsonb) - 'exam')
         is distinct from (coalesce(v_new->'locations','{}'::jsonb) - 'exam')
    then
      raise exception 'A1/A chỉ được chỉnh sửa lịch Thi sát hạch. Lịch cũ khác được bảo toàn.';
    end if;
    if coalesce(v_new->'dates','{}'::jsonb) ? 'exam' then
      if nullif(btrim(coalesce(v_new->'locations'->>'exam','')),'') is null
        or coalesce(v_new->'dates'->>'exam','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}' then
        raise exception 'A1/A cần nhập đầy đủ Ngày giờ và Địa điểm / hình thức Thi sát hạch.';
      end if;
    end if;
  end if;
  update public.students
  set notes = coalesce(p_notes, ''), updated_at = now()
  where id = v_student.id;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_staff_save_student_schedule(p_token text, p_student_id text, p_notes text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me jsonb; v_id uuid; v_name text;
  v_license text; v_old_notes text; v_old jsonb; v_new jsonb;
begin
  v_me:=public.app_me(p_token);
  if v_me->>'role'<>'user' then raise exception 'Chỉ nhân viên sử dụng chức năng lập lịch riêng này.'; end if;
  if pg_catalog.length(coalesce(p_notes,''))>30000 then raise exception 'Nội dung lịch quá dài.'; end if;
  select id,name,license_class,notes into v_id,v_name,v_license,v_old_notes from public.students
  where id::text=pg_catalog.btrim(coalesce(p_student_id,'')) and owner_id=(v_me->>'id')::uuid
    and deleted_at is null for update;
  if v_id is null then raise exception 'Chỉ được quản lý lịch của học viên do tài khoản này nhập.'; end if;
  if private.app_is_motorcycle_license(v_license) then
    v_old := public.app_schedule_payload(v_old_notes);
    v_new := public.app_schedule_payload(p_notes);
    if (coalesce(v_old->'dates','{}'::jsonb) - 'exam')
         is distinct from (coalesce(v_new->'dates','{}'::jsonb) - 'exam')
      or (coalesce(v_old->'locations','{}'::jsonb) - 'exam')
         is distinct from (coalesce(v_new->'locations','{}'::jsonb) - 'exam')
    then
      raise exception 'A1/A chỉ được chỉnh sửa lịch Thi sát hạch. Lịch cũ khác được bảo toàn.';
    end if;
    if coalesce(v_new->'dates','{}'::jsonb) ? 'exam' then
      if nullif(btrim(coalesce(v_new->'locations'->>'exam','')),'') is null
        or coalesce(v_new->'dates'->>'exam','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}' then
        raise exception 'A1/A cần nhập đầy đủ Ngày giờ và Địa điểm / hình thức Thi sát hạch.';
      end if;
    end if;
  end if;
  update public.students set notes=coalesce(p_notes,''),updated_at=pg_catalog.now() where id=v_id;
  insert into public.app_audit_logs(actor_id,actor_username,actor_role,action,entity_type,entity_id,entity_label,details)
  values((v_me->>'id')::uuid,pg_catalog.left(v_me->>'username',80),'user','schedule_changed',
    'student',v_id::text,pg_catalog.left(v_name,180),'{"scope":"own_student","type":"milestones"}'::jsonb);
  return true;
end;
$function$;
