-- Học viên được phép đăng ký ca học: NULL = tất cả học viên ô tô phù hợp.
-- Existing ca học remain unrestricted; only authenticated admin may change audience.
alter table public.training_slots add column if not exists allowed_student_ids uuid[];
comment on column public.training_slots.allowed_student_ids is 'NULL = all eligible car students; nonempty UUID array = selected students only.';

create or replace function public.app_admin_save_training_slot_audience(
  p_token text, p_slot_id text, p_session_type text, p_starts_at text,
  p_duration_minutes integer, p_location text, p_instructor_name text,
  p_vehicle_plate text, p_capacity integer, p_note text, p_status text,
  p_allowed_student_ids uuid[]
) returns text
language plpgsql security definer
set search_path to public, extensions, pg_temp
as $function$
declare
  v_id uuid;
  v_ids uuid[];
begin
  perform public.app_require_admin(p_token);
  if p_allowed_student_ids is not null then
    if cardinality(p_allowed_student_ids) = 0 then
      raise exception 'Vui lòng chọn ít nhất một học viên hoặc mở đăng ký cho tất cả học viên phù hợp.';
    end if;
    if exists (select 1 from unnest(p_allowed_student_ids) as selected(id) where not exists (select 1 from public.students s where s.id = selected.id and s.deleted_at is null and not private.app_is_motorcycle_license(s.license_class) and nullif(btrim(s.license_class),'') is not null)) then
      raise exception 'Danh sách có học viên không phù hợp hoặc không còn hồ sơ.';
    end if;
    select array_agg(distinct selected.id order by selected.id) into v_ids from unnest(p_allowed_student_ids) as selected(id);
  end if;

  -- Serialize edits with the existing registration/approval row lock.
  if nullif(btrim(coalesce(p_slot_id,'')), '') is not null then
    perform 1 from public.training_slots where id = btrim(p_slot_id)::uuid for update;
  end if;
  v_id := public.app_admin_save_training_slot(p_token,p_slot_id,p_session_type,p_starts_at,
    p_duration_minutes,p_location,p_instructor_name,p_vehicle_plate,p_capacity,p_note,p_status)::uuid;
  if v_ids is not null and exists (
    select 1 from public.student_training_requests r
    where r.slot_id = v_id and r.status = 'pending' and not (r.student_id = any(v_ids))
  ) then
    raise exception 'Có học viên đang chờ duyệt bị bỏ khỏi danh sách. Vui lòng xử lý yêu cầu trước khi bỏ quyền đăng ký.';
  end if;
  update public.training_slots set allowed_student_ids = v_ids where id = v_id;
  return v_id::text;
end;
$function$;
revoke all on function public.app_admin_save_training_slot_audience(text,text,text,text,integer,text,text,text,integer,text,text,uuid[]) from public;
grant execute on function public.app_admin_save_training_slot_audience(text,text,text,text,integer,text,text,text,integer,text,text,uuid[]) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_list_training_slots(p_token text, p_session_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_me jsonb;
  v_account_kind text;
begin
  begin
    v_me := public.app_me(p_token);
    v_account_kind := 'manager';
  exception
    when others then
      v_me := public.app_student_me(p_token);
      v_account_kind := 'student';
  end;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', slot.id,
        'session_type', slot.session_type,
        'starts_at', slot.starts_at,
        'duration_minutes', slot.duration_minutes,
        'ends_at', slot.starts_at + make_interval(mins => slot.duration_minutes),
        'location', slot.location,
        'instructor_name', slot.instructor_name,
        'vehicle_plate', slot.vehicle_plate,
        'capacity', slot.capacity,
        'booked_count', (
          select count(*)
          from public.student_training_sessions session
          where session.slot_id = slot.id
        ),
        'pending_count', (
          select count(*)
          from public.student_training_requests request
          where request.slot_id = slot.id
            and request.status = 'pending'
        ),
        'available_count', greatest(
          slot.capacity - (
            select count(*)
            from public.student_training_sessions session
            where session.slot_id = slot.id
          ) - (
            select count(*)
            from public.student_training_requests request
            where request.slot_id = slot.id
              and request.status = 'pending'
          ),
          0
        ),
        'allowed_student_ids', case when v_account_kind = 'manager' and v_me->>'role' = 'admin' then to_jsonb(slot.allowed_student_ids) else null end,
        'status', slot.status,
        'note', slot.note,
        'created_at', slot.created_at,
        'updated_at', slot.updated_at
      )
      order by slot.starts_at, slot.created_at
    )
    from public.training_slots slot
    where (
      nullif(btrim(coalesce(p_session_type, '')), '') is null
      or slot.session_type = btrim(p_session_type)
    )
    and (
      v_account_kind = 'manager'
      or (
        v_me->>'role' = 'student'
        and exists (select 1 from public.students s where s.id = (v_me->>'student_id')::uuid and s.deleted_at is null and not private.app_is_motorcycle_license(s.license_class) and nullif(btrim(s.license_class),'') is not null)
        and (slot.allowed_student_ids is null or (v_me->>'student_id')::uuid = any(slot.allowed_student_ids))
        and slot.status = 'open'
        and slot.starts_at > now()
        and (
          select count(*)
          from public.student_training_sessions session
          where session.slot_id = slot.id
        ) + (
          select count(*)
          from public.student_training_requests request
          where request.slot_id = slot.id
            and request.status = 'pending'
        ) < slot.capacity
      )
    )
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_student_create_training_request_slot(p_token text, p_slot_id text, p_note text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_me jsonb;
  v_student_id uuid;
  v_slot public.training_slots;
  v_reserved integer;
  v_id uuid;
  v_ends_at timestamptz;
begin
  v_me := public.app_student_me(p_token);
  if v_me->>'role' is distinct from 'student' then
    raise exception 'Chỉ tài khoản học viên được đăng ký ca học.';
  end if;
  v_student_id := (v_me->>'student_id')::uuid;
  if not exists (select 1 from public.students s where s.id = v_student_id and s.deleted_at is null and not private.app_is_motorcycle_license(s.license_class) and nullif(btrim(s.license_class),'') is not null) then
    raise exception 'Học viên không thuộc đối tượng đăng ký ca thực hành ô tô.';
  end if;

  begin
    select *
    into v_slot
    from public.training_slots
    where id = btrim(coalesce(p_slot_id, ''))::uuid
    for update;
  exception
    when invalid_text_representation then
      raise exception 'Ca học không hợp lệ.';
  end;

  if v_slot.id is null then
    raise exception 'Không tìm thấy ca học.';
  end if;
  if v_slot.allowed_student_ids is not null and not (v_student_id = any(v_slot.allowed_student_ids)) then
    raise exception 'Anh/chị không thuộc danh sách được phép đăng ký ca học này.';
  end if;
  if v_slot.status <> 'open' then
    raise exception 'Ca học này đã đóng đăng ký.';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'Ca học này đã bắt đầu hoặc đã kết thúc.';
  end if;

  select
    (select count(*) from public.student_training_sessions where slot_id = v_slot.id)
    + (select count(*) from public.student_training_requests where slot_id = v_slot.id and status = 'pending')
  into v_reserved;

  if v_reserved >= v_slot.capacity then
    raise exception 'Ca học này đã đủ số lượng đăng ký.';
  end if;

  v_ends_at := v_slot.starts_at + make_interval(mins => v_slot.duration_minutes);
  if exists (
    select 1
    from public.student_training_sessions session
    left join public.training_slots other_slot on other_slot.id = session.slot_id
    where session.student_id = v_student_id
      and coalesce(other_slot.starts_at, session.starts_at) < v_ends_at
      and coalesce(
        other_slot.starts_at + make_interval(mins => other_slot.duration_minutes),
        session.starts_at + interval '120 minutes'
      ) > v_slot.starts_at
  ) then
    raise exception 'Anh/chị đã có lịch học khác trùng thời gian với ca này.';
  end if;

  insert into public.student_training_requests(
    student_id, request_type, requested_at, note, slot_id
  )
  values (
    v_student_id, v_slot.session_type, v_slot.starts_at,
    btrim(coalesce(p_note, '')), v_slot.id
  )
  returning id into v_id;

  return v_id::text;
exception
  when unique_violation then
    raise exception 'Anh/chị đã gửi yêu cầu cho ca học này.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_admin_review_training_request_slot(p_token text, p_request_id text, p_decision text, p_slot_id text, p_admin_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_request public.student_training_requests;
  v_slot public.training_slots;
  v_slot_id uuid;
  v_booked integer;
  v_session_id uuid;
  v_ends_at timestamptz;
  v_session_note text;
begin
  perform public.app_require_admin(p_token);

  if coalesce(p_decision, '') not in ('approved', 'rejected') then
    raise exception 'Quyết định duyệt không hợp lệ.';
  end if;

  select *
  into v_request
  from public.student_training_requests
  where id::text = btrim(coalesce(p_request_id, ''))
  for update;

  if v_request.id is null then
    raise exception 'Không tìm thấy yêu cầu đăng ký.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Yêu cầu này đã được xử lý.';
  end if;

  if p_decision = 'approved' then
    begin
      v_slot_id := coalesce(
        nullif(btrim(coalesce(p_slot_id, '')), '')::uuid,
        v_request.slot_id
      );
    exception
      when invalid_text_representation then
        raise exception 'Ca học không hợp lệ.';
    end;

    select *
    into v_slot
    from public.training_slots
    where id = v_slot_id
    for update;

    if v_slot.id is null then
      raise exception 'Vui lòng chọn ca học để duyệt.';
    end if;
    if not exists (select 1 from public.students s where s.id = v_request.student_id and s.deleted_at is null and not private.app_is_motorcycle_license(s.license_class) and nullif(btrim(s.license_class),'') is not null) then
      raise exception 'Học viên không thuộc đối tượng đăng ký ca thực hành ô tô.';
    end if;
    if v_slot.allowed_student_ids is not null and not (v_request.student_id = any(v_slot.allowed_student_ids)) then
      raise exception 'Học viên không thuộc danh sách được phép đăng ký ca học này.';
    end if;
    if v_slot.status <> 'open' then
      raise exception 'Ca học đã đóng đăng ký.';
    end if;
    if v_slot.starts_at <= now() then
      raise exception 'Ca học đã bắt đầu hoặc đã kết thúc.';
    end if;
    if v_slot.session_type <> v_request.request_type then
      raise exception 'Nội dung ca học không phù hợp với yêu cầu.';
    end if;

    select count(*)::integer
    into v_booked
    from public.student_training_sessions
    where slot_id = v_slot.id;

    if v_booked >= v_slot.capacity then
      raise exception 'Ca học đã đủ % học viên.', v_slot.capacity;
    end if;

    v_ends_at := v_slot.starts_at + make_interval(mins => v_slot.duration_minutes);
    if exists (
      select 1
      from public.student_training_sessions session
      left join public.training_slots other_slot on other_slot.id = session.slot_id
      where session.student_id = v_request.student_id
        and coalesce(other_slot.starts_at, session.starts_at) < v_ends_at
        and coalesce(
          other_slot.starts_at + make_interval(mins => other_slot.duration_minutes),
          session.starts_at + interval '120 minutes'
        ) > v_slot.starts_at
    ) then
      raise exception 'Học viên đã có lịch khác trùng thời gian với ca này.';
    end if;

    v_session_note := concat_ws(
      ' · ',
      nullif(btrim(coalesce(v_request.note, '')), ''),
      nullif('Admin: ' || btrim(coalesce(p_admin_note, '')), 'Admin: ')
    );

    insert into public.student_training_sessions(
      student_id, session_type, starts_at, location, note, slot_id
    )
    values (
      v_request.student_id, v_slot.session_type, v_slot.starts_at,
      v_slot.location, v_session_note, v_slot.id
    )
    returning id into v_session_id;
  end if;

  update public.student_training_requests
  set status = p_decision,
      slot_id = coalesce(v_slot_id, slot_id),
      admin_note = btrim(coalesce(p_admin_note, '')),
      approved_session_id = v_session_id,
      reviewed_at = now(),
      updated_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'id', v_request.id,
    'status', p_decision,
    'slot_id', coalesce(v_slot_id, v_request.slot_id),
    'approved_session_id', v_session_id
  );
exception
  when unique_violation then
    raise exception 'Học viên đã được xếp vào ca học này.';
end;
$function$;

notify pgrst, 'reload schema';
