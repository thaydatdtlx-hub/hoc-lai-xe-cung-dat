-- Individual training time slices; keep already booked legacy group slots intact.
alter table public.training_slots add column if not exists split_enabled boolean not null default true;
update public.training_slots t set split_enabled=false where t.capacity>t.duration_minutes
 or exists(select 1 from public.student_training_requests r where r.slot_id=t.id and r.status='pending')
 or exists(select 1 from public.student_training_sessions s where s.slot_id=t.id);
alter table public.student_training_requests add column if not exists slot_segment_index integer;
alter table public.student_training_requests add column if not exists slot_segment_minutes integer;
alter table public.student_training_sessions add column if not exists slot_segment_index integer;
create unique index if not exists training_requests_pending_segment_unique on public.student_training_requests(slot_id,slot_segment_index) where status='pending' and slot_id is not null and slot_segment_index is not null;
create unique index if not exists training_sessions_segment_unique on public.student_training_sessions(slot_id,slot_segment_index) where slot_id is not null and slot_segment_index is not null;

create or replace function private.app_training_slot_segments(p_slot_id uuid) returns jsonb
language sql stable set search_path to public, pg_temp
as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'index',i,
  'starts_at',t.starts_at+make_interval(mins=>i*t.duration_minutes/t.capacity),
  'ends_at',t.starts_at+make_interval(mins=>(i+1)*t.duration_minutes/t.capacity),
  'duration_minutes',(i+1)*t.duration_minutes/t.capacity-i*t.duration_minutes/t.capacity,
  'status',case when exists(select 1 from public.student_training_sessions s where s.slot_id=t.id and s.slot_segment_index=i) then 'booked'
    when exists(select 1 from public.student_training_requests r where r.slot_id=t.id and r.slot_segment_index=i and r.status='pending') then 'pending'
    when t.status<>'open' then 'closed'
    when t.starts_at+make_interval(mins=>i*t.duration_minutes/t.capacity)<=now() then 'expired'
    else 'available' end) order by i),'[]'::jsonb)
from public.training_slots t cross join lateral generate_series(0,t.capacity-1) i
where t.id=p_slot_id and t.split_enabled;
$$;
revoke all on function private.app_training_slot_segments(uuid) from public, anon, authenticated;

-- Keep individual session time consistent even if an old session editor attempts to move it.
create or replace function private.app_guard_training_segment_session() returns trigger language plpgsql set search_path to public,pg_temp as $$
declare t public.training_slots;
begin
  if tg_op='UPDATE' and old.slot_segment_index is not null and
    (new.slot_id is distinct from old.slot_id or new.slot_segment_index is distinct from old.slot_segment_index or new.student_id is distinct from old.student_id) then
    -- ON DELETE SET NULL of a parent slot retains the actual historical session time.
    if not (new.slot_id is null and not exists(select 1 from public.training_slots where id=old.slot_id) and new.student_id=old.student_id) then
      raise exception 'Không được đổi học viên hoặc khung giờ của ca đã đăng ký.';
    end if;
  end if;
  if new.slot_id is not null and new.slot_segment_index is not null then
    select * into t from public.training_slots where id=new.slot_id;
    if not t.split_enabled or new.slot_segment_index<0 or new.slot_segment_index>=t.capacity or
      new.starts_at is distinct from t.starts_at+make_interval(mins=>new.slot_segment_index*t.duration_minutes/t.capacity) or
      new.session_type is distinct from t.session_type then
      raise exception 'Không được thay đổi giờ học đã đăng ký qua ca học riêng.';
    end if;
    new.duration_minutes := (new.slot_segment_index+1)*t.duration_minutes/t.capacity-new.slot_segment_index*t.duration_minutes/t.capacity;
  end if;
  return new;
end;$$;
revoke all on function private.app_guard_training_segment_session() from public, anon, authenticated;
create trigger app_guard_training_segment_session before insert or update on public.student_training_sessions for each row execute function private.app_guard_training_segment_session();

CREATE OR REPLACE FUNCTION public.app_student_create_training_request_segment(p_token text, p_slot_id text, p_note text, p_segment_index integer)
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
  v_start_at timestamptz;
  v_segment_index integer;
  v_minutes integer;
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
  -- The slot row is locked above: first valid reservation wins.
  if v_slot.split_enabled then
    v_segment_index := coalesce(p_segment_index, case when v_slot.capacity = 1 then 0 else null end);
    if v_segment_index is null or v_segment_index < 0 or v_segment_index >= v_slot.capacity then
      raise exception 'Vui lòng chọn một khung giờ học cụ thể.';
    end if;
    v_start_at := v_slot.starts_at + make_interval(mins => v_segment_index * v_slot.duration_minutes / v_slot.capacity);
    v_minutes := (v_segment_index + 1) * v_slot.duration_minutes / v_slot.capacity - v_segment_index * v_slot.duration_minutes / v_slot.capacity;
    if exists (select 1 from public.student_training_requests r where r.slot_id=v_slot.id and r.slot_segment_index=v_segment_index and r.status='pending')
       or exists (select 1 from public.student_training_sessions s where s.slot_id=v_slot.id and s.slot_segment_index=v_segment_index) then
      raise exception 'Ca học đã được đăng ký';
    end if;
  else
    if p_segment_index is not null then raise exception 'Ca học cũ không chia khung giờ.'; end if;
    v_start_at := v_slot.starts_at;
    v_minutes := v_slot.duration_minutes;
  end if;
  if v_start_at <= now() then raise exception 'Ca học này đã bắt đầu hoặc đã kết thúc.'; end if;
  if exists (select 1 from public.student_training_requests r where r.slot_id=v_slot.id and r.student_id=v_student_id and r.status='pending')
     or exists (select 1 from public.student_training_sessions s where s.slot_id=v_slot.id and s.student_id=v_student_id) then
    raise exception 'Anh/chị đã đăng ký một khung giờ trong ca học này.';
  end if;
  perform 1 from public.students where id=v_student_id for update;

  select
    (select count(*) from public.student_training_sessions where slot_id = v_slot.id)
    + (select count(*) from public.student_training_requests where slot_id = v_slot.id and status = 'pending')
  into v_reserved;

  if v_reserved >= v_slot.capacity then
    raise exception 'Ca học này đã đủ số lượng đăng ký.';
  end if;

  v_ends_at := v_start_at + make_interval(mins => v_minutes);
  if exists (
    select 1
    from public.student_training_sessions session
    left join public.training_slots other_slot on other_slot.id = session.slot_id
    where session.student_id = v_student_id
      and session.starts_at < v_ends_at
      and session.starts_at + make_interval(mins => coalesce(session.duration_minutes,other_slot.duration_minutes,120)) > v_start_at
  ) then
    raise exception 'Anh/chị đã có lịch học khác trùng thời gian với ca này.';
  end if;

  if exists (
    select 1 from public.student_training_requests r
    left join public.training_slots t on t.id=r.slot_id
    where r.student_id=v_student_id and r.status='pending' and r.requested_at < v_ends_at
      and r.requested_at + make_interval(mins=>coalesce(r.slot_segment_minutes,t.duration_minutes,120)) > v_start_at
  ) then raise exception 'Anh/chị đã có yêu cầu học khác trùng thời gian.'; end if;
  insert into public.student_training_requests(
    student_id, request_type, requested_at, note, slot_id, slot_segment_index, slot_segment_minutes
  )
  values (
    v_student_id, v_slot.session_type, v_start_at,
    btrim(coalesce(p_note, '')), v_slot.id, v_segment_index, case when v_slot.split_enabled then v_minutes else null end
  )
  returning id into v_id;

  return v_id::text;
exception
  when unique_violation then
    raise exception 'Anh/chị đã gửi yêu cầu cho ca học này.';
end;
$function$;
revoke all on function public.app_student_create_training_request_segment(text,text,text,integer) from public;
grant execute on function public.app_student_create_training_request_segment(text,text,text,integer) to anon, authenticated, service_role;

-- Compatibility: old portal may still book single-place or legacy slots, but must choose a time for split slots.
create or replace function public.app_student_create_training_request_slot(p_token text,p_slot_id text,p_note text) returns text
language sql security definer set search_path to public,extensions,pg_temp as $$
select public.app_student_create_training_request_segment(p_token,p_slot_id,p_note,null);
$$;

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
  v_start_at timestamptz;
  v_minutes integer;
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
    if v_slot.split_enabled then
      if v_request.slot_id is distinct from v_slot.id or v_request.slot_segment_index is null
         or v_request.slot_segment_index < 0 or v_request.slot_segment_index >= v_slot.capacity then
        raise exception 'Yêu cầu không có khung giờ hợp lệ của ca học này.';
      end if;
      v_start_at := v_slot.starts_at + make_interval(mins => v_request.slot_segment_index * v_slot.duration_minutes / v_slot.capacity);
      v_minutes := (v_request.slot_segment_index+1)*v_slot.duration_minutes/v_slot.capacity-v_request.slot_segment_index*v_slot.duration_minutes/v_slot.capacity;
      if v_request.requested_at is distinct from v_start_at or v_request.slot_segment_minutes is distinct from v_minutes then
        raise exception 'Khung giờ đã thay đổi. Vui lòng xử lý lại yêu cầu.';
      end if;
      if exists(select 1 from public.student_training_sessions s where s.slot_id=v_slot.id and s.slot_segment_index=v_request.slot_segment_index) then
        raise exception 'Ca học đã được đăng ký';
      end if;
    else
      if v_request.slot_segment_index is not null then raise exception 'Không được chuyển khung giờ đã đặt sang ca cũ.'; end if;
      v_start_at := v_slot.starts_at;
      v_minutes := v_slot.duration_minutes;
    end if;
    if v_start_at <= now() then raise exception 'Ca học đã bắt đầu hoặc đã kết thúc.'; end if;
    perform 1 from public.students where id=v_request.student_id for update;
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

    v_ends_at := v_start_at + make_interval(mins => v_minutes);
    if exists (
      select 1
      from public.student_training_sessions session
      left join public.training_slots other_slot on other_slot.id = session.slot_id
      where session.student_id = v_request.student_id
        and session.starts_at < v_ends_at
        and session.starts_at + make_interval(mins=>coalesce(session.duration_minutes,other_slot.duration_minutes,120)) > v_start_at
    ) then
      raise exception 'Học viên đã có lịch khác trùng thời gian với ca này.';
    end if;

    v_session_note := concat_ws(
      ' · ',
      nullif(btrim(coalesce(v_request.note, '')), ''),
      nullif('Admin: ' || btrim(coalesce(p_admin_note, '')), 'Admin: ')
    );

    insert into public.student_training_sessions(
      student_id, session_type, starts_at, location, note, slot_id, slot_segment_index, duration_minutes
    )
    values (
      v_request.student_id, v_slot.session_type, v_start_at,
      v_slot.location, v_session_note, v_slot.id, v_request.slot_segment_index, case when v_slot.split_enabled then v_minutes else null end
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

CREATE OR REPLACE FUNCTION public.app_admin_save_training_slot(p_token text, p_slot_id text, p_session_type text, p_starts_at text, p_duration_minutes integer, p_location text, p_instructor_name text, p_vehicle_plate text, p_capacity integer, p_note text, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration integer;
  v_capacity integer;
  v_booked integer;
  v_instructor text;
  v_vehicle text;
  v_conflict public.training_slots;
  v_existing public.training_slots;
begin
  perform public.app_require_admin(p_token);

  if coalesce(p_session_type, '') not in ('familiar', 'dat_practice', 'practice') then
    raise exception 'Nội dung ca học không hợp lệ.';
  end if;
  if coalesce(p_status, '') not in ('open', 'closed', 'cancelled') then
    raise exception 'Trạng thái ca học không hợp lệ.';
  end if;

  begin
    v_starts_at := btrim(coalesce(p_starts_at, ''))::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Ngày và giờ ca học không hợp lệ.';
  end;

  v_duration := coalesce(p_duration_minutes, 120);
  v_capacity := coalesce(p_capacity, 1);
  if v_duration < 30 or v_duration > 480 then
    raise exception 'Thời lượng phải từ 30 đến 480 phút.';
  end if;
  if v_capacity < 1 or v_capacity > 100 then
    raise exception 'Số lượng học viên phải từ 1 đến 100.';
  end if;

  if nullif(btrim(coalesce(p_slot_id, '')), '') is not null then
    begin
      v_id := btrim(p_slot_id)::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Ca học không hợp lệ.';
    end;
  end if;

  if v_id is not null then
    select * into v_existing from public.training_slots where id=v_id for update;
    if v_existing.split_enabled and
       (v_existing.starts_at is distinct from v_starts_at or v_existing.duration_minutes is distinct from v_duration
       or v_existing.capacity is distinct from v_capacity or v_existing.session_type is distinct from p_session_type)
       and (exists(select 1 from public.student_training_requests r where r.slot_id=v_id and r.status='pending')
         or exists(select 1 from public.student_training_sessions s where s.slot_id=v_id)) then
      raise exception 'Ca đã có học viên đăng ký. Không được đổi giờ, thời lượng, số chỗ hoặc nội dung khi còn lịch đã đặt.';
    end if;
  end if;
  if (v_id is null or v_existing.split_enabled) and v_capacity > v_duration then
    raise exception 'Số học viên không thể lớn hơn số phút của ca học.';
  end if;
  select count(*)::integer
  into v_booked
  from public.student_training_sessions
  where slot_id = v_id;

  if v_capacity < v_booked then
    raise exception 'Ca học đã có % học viên; không thể giảm sức chứa xuống %.', v_booked, v_capacity;
  end if;

  v_ends_at := v_starts_at + make_interval(mins => v_duration);
  v_instructor := btrim(coalesce(p_instructor_name, ''));
  v_vehicle := upper(btrim(coalesce(p_vehicle_plate, '')));

  select slot.*
  into v_conflict
  from public.training_slots slot
  where slot.id is distinct from v_id
    and slot.status <> 'cancelled'
    and slot.starts_at < v_ends_at
    and slot.starts_at + make_interval(mins => slot.duration_minutes) > v_starts_at
    and (
      (
        v_instructor <> ''
        and lower(btrim(slot.instructor_name)) = lower(v_instructor)
      )
      or (
        v_vehicle <> ''
        and upper(btrim(slot.vehicle_plate)) = v_vehicle
      )
    )
  order by slot.starts_at
  limit 1;

  if v_conflict.id is not null then
    if v_instructor <> ''
       and lower(btrim(v_conflict.instructor_name)) = lower(v_instructor) then
      raise exception 'Giáo viên % đã có ca học trùng thời gian.', v_instructor;
    end if;
    raise exception 'Xe % đã có ca học trùng thời gian.', v_vehicle;
  end if;

  if v_id is null then
    insert into public.training_slots(
      session_type, starts_at, duration_minutes, location,
      instructor_name, vehicle_plate, capacity, note, status
    )
    values (
      p_session_type, v_starts_at, v_duration, btrim(coalesce(p_location, '')),
      v_instructor, v_vehicle, v_capacity, btrim(coalesce(p_note, '')), p_status
    )
    returning id into v_id;
  else
    update public.training_slots
    set session_type = p_session_type,
        starts_at = v_starts_at,
        duration_minutes = v_duration,
        location = btrim(coalesce(p_location, '')),
        instructor_name = v_instructor,
        vehicle_plate = v_vehicle,
        capacity = v_capacity,
        note = btrim(coalesce(p_note, '')),
        status = p_status,
        updated_at = now()
    where id = v_id;

    if not found then
      raise exception 'Không tìm thấy ca học.';
    end if;

    update public.student_training_sessions
    set session_type = p_session_type,
        starts_at = case when slot_segment_index is not null then starts_at else v_starts_at end,
        location = btrim(coalesce(p_location, '')),
        updated_at = now()
    where slot_id = v_id;
  end if;

  return v_id::text;
end;
$function$;

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
        'split_enabled', slot.split_enabled,
        'segments', case when slot.split_enabled then private.app_training_slot_segments(slot.id) else '[]'::jsonb end,
        'student_registered', case when v_account_kind='student' then
          exists(select 1 from public.student_training_requests r where r.slot_id=slot.id and r.student_id::text=v_me->>'student_id' and r.status='pending')
          or exists(select 1 from public.student_training_sessions s where s.slot_id=slot.id and s.student_id::text=v_me->>'student_id')
          else false end,
        'available_count', case when slot.split_enabled then (select count(*) from jsonb_array_elements(private.app_training_slot_segments(slot.id)) seg where seg->>'status'='available') else greatest(
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
        ) end,
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
        and (case when slot.split_enabled then slot.starts_at + make_interval(mins=>slot.duration_minutes)>now() else slot.starts_at > now() end)
      )
    )
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_list_training_requests(p_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_me jsonb;
  v_account_kind text;
  v_student_id text;
begin
  begin
    v_me := public.app_me(p_token);
    v_account_kind := 'manager';
  exception
    when others then
      v_me := public.app_student_me(p_token);
      v_account_kind := 'student';
      v_student_id := v_me->>'student_id';
  end;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', request.id,
        'student_id', request.student_id,
        'request_type', request.request_type,
        'requested_at', request.requested_at,
        'note', request.note,
        'status', request.status,
        'admin_note', request.admin_note,
        'approved_session_id', request.approved_session_id,
        'slot_id', request.slot_id,
        'created_at', request.created_at,
        'updated_at', request.updated_at,
        'reviewed_at', request.reviewed_at,
        'student_name', student.name,
        'student_code', student.student_code,
        'slot_segment_index', request.slot_segment_index,
        'slot_starts_at', case when request.slot_segment_index is not null then request.requested_at else slot.starts_at end,
        'slot_duration_minutes', coalesce(request.slot_segment_minutes,slot.duration_minutes),
        'slot_location', slot.location,
        'slot_instructor_name', slot.instructor_name,
        'slot_vehicle_plate', slot.vehicle_plate,
        'slot_capacity', slot.capacity,
        'slot_status', slot.status
      )
      order by
        case when request.status = 'pending' then 0 else 1 end,
        request.created_at desc
    )
    from public.student_training_requests request
    join public.students student on student.id = request.student_id
    left join public.training_slots slot on slot.id = request.slot_id
    where (
      v_account_kind = 'student'
      and request.student_id::text = v_student_id
    ) or (
      v_account_kind = 'manager'
      and (
        coalesce(v_me->>'role', '') = 'admin'
        or student.owner_id::text = v_me->>'id'
      )
      and (
        nullif(btrim(coalesce(p_student_id, '')), '') is null
        or request.student_id::text = btrim(p_student_id)
      )
    )
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_list_training_sessions(p_token text, p_student_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_me jsonb;
  v_account_kind text;
  v_student_id text;
begin
  begin
    v_me := public.app_me(p_token);
    v_account_kind := 'manager';
  exception when others then
    v_me := public.app_student_me(p_token);
    v_account_kind := 'student';
    v_student_id := v_me->>'student_id';
  end;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', session.id,
      'student_id', session.student_id,
      'session_type', session.session_type,
      'starts_at', session.starts_at,
      'location', session.location,
      'note', session.note,
      'slot_id', session.slot_id,
      'slot_segment_index', session.slot_segment_index,
      'duration_minutes', coalesce(session.duration_minutes, slot.duration_minutes, 120),
      'instructor_name', coalesce(nullif(session.instructor_name,''), nullif(slot.instructor_name,''), ''),
      'vehicle_plate', coalesce(slot.vehicle_plate, ''),
      'slot_capacity', slot.capacity,
      'slot_status', slot.status,
      'attendance', case when ar.id is null then null else jsonb_build_object(
        'id',ar.id,'student_checkin_at',ar.student_checkin_at,'review_status',ar.review_status,
        'reviewed_at',ar.reviewed_at,'review_note',ar.review_note,'actual_minutes',ar.actual_minutes
      ) end,
      'created_at', session.created_at,
      'updated_at', session.updated_at
    ) order by session.starts_at, session.created_at)
    from public.student_training_sessions session
    join public.students student on student.id=session.student_id
    left join public.training_slots slot on slot.id=session.slot_id
    left join public.app_attendance_records ar on ar.training_session_id=session.id
    where (v_account_kind='student' and session.student_id::text=v_student_id)
       or (v_account_kind='manager'
           and (coalesce(v_me->>'role','')='admin' or student.owner_id::text=v_me->>'id')
           and (nullif(btrim(coalesce(p_student_id,'')),'') is null or session.student_id::text=btrim(p_student_id)))
  ),'[]'::jsonb);
end;
$function$;

notify pgrst,'reload schema';
