-- Admin-only whole-slot cancellation and deletion. Existing records are not modified by migration.
CREATE OR REPLACE FUNCTION public.app_training_request_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_name text;
  v_label text;
  v_time text;
begin
  -- Whole-slot removal emits one consolidated notice per account (or none if opted out).
  if tg_op='UPDATE' and new.status='cancelled' and current_setting('app.training_slot_removal',true)='on' then
    return new;
  end if;
  select name into v_name from public.students where id = new.student_id;
  v_label := public.app_schedule_label(new.request_type);
  v_time := to_char(new.requested_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI ngày DD/MM/YYYY');

  if tg_op = 'INSERT' then
    perform public.app_notify_managers(
      new.student_id, 'request-new:' || new.id, 'cyan', '✋',
      'Yêu cầu lịch mới: ' || coalesce(v_name, 'Học viên'),
      v_label || ' · ' || v_time,
      '/lich-dao-tao.html#trainingRequests', 'Duyệt yêu cầu', new.requested_at
    );
  elsif new.status is distinct from old.status then
    if new.status = 'approved' then
      perform public.app_notify_student(
        new.student_id, 'request-approved:' || new.id, 'green', '✓',
        'Lịch học đã được Admin duyệt',
        v_label || ' · ' || v_time ||
          case when nullif(new.admin_note, '') is not null then ' · ' || new.admin_note else '' end,
        '/lich-dao-tao.html', 'Xem lịch chính thức', new.requested_at
      );
    elsif new.status = 'rejected' then
      perform public.app_notify_student(
        new.student_id, 'request-rejected:' || new.id, 'red', '!',
        'Yêu cầu lịch chưa được duyệt',
        v_label || case when nullif(new.admin_note, '') is not null then ' · ' || new.admin_note else '' end,
        '/lich-dao-tao.html', 'Xem yêu cầu', new.requested_at
      );
    elsif new.status = 'cancelled' then
      perform public.app_notify_student(
        new.student_id, 'request-cancelled:' || new.id, 'orange', '×',
        'Yêu cầu lịch đã được hủy', v_label || ' · ' || v_time,
        '/lich-dao-tao.html', 'Xem yêu cầu', new.requested_at
      );
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_training_session_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_row public.student_training_sessions;
  v_label text;
begin
  if tg_op='DELETE' and current_setting('app.training_slot_removal',true)='on' then
    return old;
  end if;
  v_row := case when tg_op = 'DELETE' then old else new end;
  v_label := public.app_schedule_label(v_row.session_type);

  if tg_op = 'DELETE' then
    perform public.app_notify_student(
      v_row.student_id, 'session-cancelled:' || v_row.id || ':' || extract(epoch from now())::bigint,
      'red', '!', 'Lịch học đã được hủy',
      v_label || ' · ' ||
        to_char(v_row.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI ngày DD/MM/YYYY'),
      '/lich-dao-tao.html', 'Xem lịch đào tạo', v_row.starts_at
    );
    return old;
  end if;

  if new.starts_at is distinct from old.starts_at
     or new.location is distinct from old.location
     or new.session_type is distinct from old.session_type then
    perform public.app_notify_student(
      new.student_id, 'session-changed:' || new.id || ':' || extract(epoch from new.updated_at)::bigint,
      'violet', '↻', 'Lịch học đã được thay đổi',
      v_label || ' · ' ||
        to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI ngày DD/MM/YYYY') ||
        case when nullif(new.location, '') is not null then ' · ' || new.location else '' end,
      '/lich-dao-tao.html', 'Xem lịch mới', new.starts_at
    );
  end if;
  return new;
end;
$function$;

create or replace function public.app_admin_remove_training_slot(
  p_token text, p_slot_id text, p_mode text, p_notify boolean,
  p_expected_booked integer, p_expected_pending integer
) returns jsonb
language plpgsql security definer
set search_path to public, extensions, pg_temp
as $function$
declare
  v_slot public.training_slots;
  v_sessions uuid[];
  v_requests uuid[];
  v_recipients uuid[];
  v_pending integer;
  v_notice_count integer := 0;
  v_previous_flag text;
  v_body text;
  v_label text;
begin
  perform public.app_require_admin(p_token);
  if coalesce(p_mode,'') not in ('cancel','delete') then
    raise exception 'Thao tác không hợp lệ.';
  end if;

  -- Serialize with registration and review. Lock session rows before checking
  -- attendance so an overlapping check-in cannot silently lose its session.
  select * into v_slot from public.training_slots
  where id=btrim(coalesce(p_slot_id,''))::uuid for update;
  if not found then raise exception 'Không tìm thấy ca học. Vui lòng tải lại trang.'; end if;
  perform 1 from public.student_training_sessions s where s.slot_id=v_slot.id order by s.id for update;
  v_sessions := array(select s.id from public.student_training_sessions s where s.slot_id=v_slot.id);
  perform 1 from public.student_training_requests r where r.slot_id=v_slot.id or r.approved_session_id=any(v_sessions) order by r.id for update;
  v_requests := array(select r.id from public.student_training_requests r where r.slot_id=v_slot.id or r.approved_session_id=any(v_sessions));
  select count(*) into v_pending from public.student_training_requests r where r.id=any(v_requests) and r.status='pending';
  if p_expected_booked is distinct from cardinality(v_sessions) or p_expected_pending is distinct from v_pending then
    raise exception 'Số học viên đăng ký đã thay đổi. Vui lòng tải lại dữ liệu và xác nhận lại.';
  end if;
  if exists(select 1 from public.app_attendance_records a where a.training_session_id=any(v_sessions)) then
    raise exception 'Ca học đã có dữ liệu điểm danh. Không thể hủy hoặc xóa để bảo toàn lịch sử; chỉ có thể đóng đăng ký.';
  end if;

  -- Notify actual registrants and recipients of the prior invitation, not unrelated students.
  v_recipients := array(
    select distinct a.id from public.app_student_accounts a
    where a.active and a.account_type='student' and (
      exists(select 1 from public.student_training_sessions s where s.id=any(v_sessions) and s.student_id::text=a.student_id)
      or exists(select 1 from public.student_training_requests r where r.id=any(v_requests) and r.status in ('pending','approved') and r.student_id::text=a.student_id)
      or exists(select 1 from public.app_notifications n where n.recipient_kind='student' and n.recipient_id=a.id and n.notification_key='training-slot-invite:'||v_slot.id::text)
    )
  );
  v_label:=public.app_schedule_label(v_slot.session_type);
  v_body:=v_label||' · '||to_char(v_slot.starts_at at time zone 'Asia/Ho_Chi_Minh','HH24:MI ngày DD/MM/YYYY')||'. Trung tâm đã hủy ca học này. Anh/chị vui lòng không đến theo lịch cũ và chọn ca khác khi có thông báo mới.';

  v_previous_flag:=current_setting('app.training_slot_removal',true);
  perform set_config('app.training_slot_removal','on',true);

  if p_mode='delete' then
    delete from public.student_training_requests where id=any(v_requests);
    delete from public.student_training_sessions where id=any(v_sessions);
    delete from public.training_slots where id=v_slot.id;
  else
    update public.student_training_requests
    set status='cancelled',approved_session_id=null,reviewed_at=now(),updated_at=now(),
        admin_note=concat_ws(' · ',nullif(admin_note,''),'Admin hủy ca học.')
    where id=any(v_requests) and status in ('pending','approved');
    delete from public.student_training_sessions where id=any(v_sessions);
    update public.training_slots set status='cancelled',updated_at=now() where id=v_slot.id;
  end if;
  perform set_config('app.training_slot_removal',coalesce(v_previous_flag,''),true);

  -- Retain the notification history but retire stale booking links.
  update public.app_notifications
  set title='Ca học không còn mở đăng ký',body=v_body,href='',action_label='',read_at=coalesce(read_at,now())
  where recipient_kind='student' and notification_key='training-slot-invite:'||v_slot.id::text;

  if coalesce(p_notify,true) then
    insert into public.app_notifications(recipient_kind,recipient_id,notification_key,category,tone,icon,title,body,href,action_label,event_at)
    select 'student',recipient,'training-slot-cancelled:'||v_slot.id::text,'schedule','red','!',
      'Thông báo hủy ca học',v_body,'/hoc-vien.html#trainingBooking','Xem lịch học',v_slot.starts_at
    from unnest(v_recipients) as recipient
    on conflict(recipient_kind,recipient_id,notification_key) do nothing;
    get diagnostics v_notice_count=row_count;
  end if;
  perform public.app_record_audit(p_token,'schedule_changed','training_slot',v_slot.id::text,v_label,
    jsonb_build_object('operation',case when p_mode='delete' then 'deleted' else 'cancelled' end,
      'starts_at',v_slot.starts_at,'removed_sessions',cardinality(v_sessions),
      'affected_requests',cardinality(v_requests),'pending_requests',v_pending,'notifications',v_notice_count));
  return jsonb_build_object('mode',p_mode,'removed_sessions',cardinality(v_sessions),
    'affected_requests',cardinality(v_requests),'notifications',v_notice_count);
end;
$function$;
revoke all on function public.app_admin_remove_training_slot(text,text,text,boolean,integer,integer) from public;
grant execute on function public.app_admin_remove_training_slot(text,text,text,boolean,integer,integer) to anon,authenticated,service_role;

-- Old clients may delete empty ca only; use the same locking and attendance guard.
create or replace function public.app_admin_delete_training_slot(p_token text,p_slot_id text)
returns boolean language plpgsql security definer set search_path to public,extensions,pg_temp
as $function$
begin
  perform public.app_admin_remove_training_slot(p_token,p_slot_id,'delete',true,0,0);
  return true;
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
  if p_status='cancelled' then
    raise exception 'Vui lòng sử dụng nút Hủy ca học để xác nhận và xử lý lịch đã đăng ký.';
  end if;
  if coalesce(p_status, '') not in ('open', 'closed') then
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
    if v_existing.status='cancelled' then raise exception 'Ca học đã hủy. Vui lòng tạo ca mới hoặc xóa ca cũ.'; end if;
    if v_existing.split_enabled and
       (v_existing.starts_at is distinct from v_starts_at or v_existing.duration_minutes is distinct from v_duration
       or v_existing.capacity is distinct from v_capacity or v_existing.session_type is distinct from p_session_type)
       and (exists(select 1 from public.student_training_requests r where r.slot_id=v_id and r.status='pending')
         or exists(select 1 from public.student_training_sessions s where s.slot_id=v_id)) then
      raise exception 'Ca đã có học viên đăng ký. Không được đổi giờ, thời lượng, số chỗ hoặc nội dung khi còn lịch đã đặt.';
    end if;
  end if;
  if (v_id is null or v_existing.split_enabled) and v_capacity*15 > v_duration then
    raise exception 'Mỗi khung giờ học phải có ít nhất 15 phút.';
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

notify pgrst,'reload schema';
