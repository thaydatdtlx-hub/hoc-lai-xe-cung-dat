-- Run after 20261125_individual_training_time_slots.sql.
-- Invitations reuse existing app_notifications and web-push delivery.
create or replace function private.app_send_training_slot_invites(p_slot_id uuid)
returns integer
language plpgsql
set search_path to public, pg_temp
as $function$
declare
  v_slot public.training_slots;
  v_count integer;
  v_title text;
  v_body text;
begin
  select * into v_slot from public.training_slots where id=p_slot_id;
  if not found or v_slot.status<>'open' or v_slot.starts_at+make_interval(mins=>v_slot.duration_minutes)<=now() then return 0; end if;
  if v_slot.split_enabled then
    if not exists(select 1 from jsonb_array_elements(private.app_training_slot_segments(p_slot_id)) item where item->>'status'='available') then return 0; end if;
  else
    if v_slot.starts_at<=now() or
      (select count(*) from public.student_training_sessions where slot_id=p_slot_id)
      +(select count(*) from public.student_training_requests where slot_id=p_slot_id and status='pending')>=v_slot.capacity then return 0; end if;
  end if;
  v_title := 'Mời đăng ký: '||public.app_schedule_label(v_slot.session_type);
  v_body := 'Ngày '||to_char(v_slot.starts_at at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY')||
    ' · '||to_char(v_slot.starts_at at time zone 'Asia/Ho_Chi_Minh','HH24:MI')||
    ' – '||to_char((v_slot.starts_at+make_interval(mins=>v_slot.duration_minutes)) at time zone 'Asia/Ho_Chi_Minh','HH24:MI')||
    case when (v_slot.starts_at at time zone 'Asia/Ho_Chi_Minh')::date <> ((v_slot.starts_at+make_interval(mins=>v_slot.duration_minutes)) at time zone 'Asia/Ho_Chi_Minh')::date then ' ngày '||to_char((v_slot.starts_at+make_interval(mins=>v_slot.duration_minutes)) at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY') else '' end||
    case when v_slot.location<>'' then ' · Địa điểm: '||v_slot.location else '' end||
    '. Vui lòng chọn khung giờ còn trống và gửi yêu cầu đăng ký.';
  insert into public.app_notifications(recipient_kind,recipient_id,notification_key,category,tone,icon,title,body,href,action_label,event_at)
  select 'student',a.id,'training-slot-invite:'||v_slot.id::text,'schedule','blue','📅',v_title,v_body,
    '/hoc-vien.html?training_slot='||v_slot.id::text||'#trainingBooking','Đăng ký ngay',v_slot.starts_at
  from public.app_student_accounts a join public.students s on s.id::text=a.student_id
  where a.active and a.account_type='student' and s.deleted_at is null
    and not private.app_is_motorcycle_license(s.license_class) and nullif(btrim(s.license_class),'') is not null
    and (v_slot.allowed_student_ids is null or s.id=any(v_slot.allowed_student_ids))
    and not exists(select 1 from public.student_training_requests r where r.slot_id=v_slot.id and r.student_id=s.id and r.status='pending')
    and not exists(select 1 from public.student_training_sessions session where session.slot_id=v_slot.id and session.student_id=s.id)
  on conflict(recipient_kind,recipient_id,notification_key) do update
  set title=excluded.title,body=excluded.body,event_at=excluded.event_at,href=excluded.href,action_label=excluded.action_label
  where (app_notifications.title,app_notifications.body,app_notifications.event_at,app_notifications.href,app_notifications.action_label)
    is distinct from (excluded.title,excluded.body,excluded.event_at,excluded.href,excluded.action_label);
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;
revoke all on function private.app_send_training_slot_invites(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_admin_save_training_slot_audience(p_token text, p_slot_id text, p_session_type text, p_starts_at text, p_duration_minutes integer, p_location text, p_instructor_name text, p_vehicle_plate text, p_capacity integer, p_note text, p_status text, p_allowed_student_ids uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
  -- Send only after final audience is saved, never while a newly inserted slot is unrestricted.
  perform private.app_send_training_slot_invites(v_id);
  return v_id::text;
end;
$function$;

-- Existing open slots are not mass-notified by a schema migration.
-- The next successful admin save invites the current audience once.
notify pgrst,'reload schema';
