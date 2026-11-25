-- System-wide Web Push: new notifications only, authenticated per-account status, bounded retries.
alter table public.app_notifications add column if not exists push_delivery_state text;
alter table public.app_notifications add column if not exists push_delivery_at timestamptz;
alter table public.app_notifications add column if not exists push_delivered_count integer not null default 0;
alter table public.app_notifications add column if not exists push_failed_count integer not null default 0;
alter table public.app_notifications add column if not exists push_dispatch_version integer not null default 0;
-- Existing notification history remains untouched (NULL state), so it is never broadcast again.
alter table public.app_notifications alter column push_delivery_state set default 'pending';
alter table public.app_notifications alter column push_delivery_at set default now();
create index if not exists app_notifications_push_retry_idx on public.app_notifications(push_delivery_at) where push_delivery_state in ('pending','retry','sending');

create or replace function private.app_is_phone_push_endpoint(p_endpoint text) returns boolean
language sql immutable set search_path to pg_catalog,pg_temp as $$
  select coalesce(p_endpoint ~* '^https://(fcm[.]googleapis[.]com|android[.]googleapis[.]com|([a-z0-9-]+[.])*push[.]apple[.]com|([a-z0-9-]+[.])*push[.]services[.]mozilla[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com|([a-z0-9-]+[.])*wns[.]windows[.]com|([a-z0-9-]+[.])*push[.]microsoft[.]com|([a-z0-9-]+[.])*push[.]samsungosp[.]com)/',false)
$$;
revoke all on function private.app_is_phone_push_endpoint(text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.app_save_push_subscription(p_token text, p_subscription jsonb, p_user_agent text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_me jsonb;
  v_kind text;
  v_endpoint text:=btrim(coalesce(p_subscription->>'endpoint',''));
  v_p256dh text:=btrim(coalesce(p_subscription#>>'{keys,p256dh}',''));
  v_auth text:=btrim(coalesce(p_subscription#>>'{keys,auth}',''));
begin
  begin
    v_me:=public.app_me(p_token);
    v_kind:='manager';
  exception when others then
    v_me:=public.app_student_me(p_token);
    if coalesce(v_me->>'role','')<>'student' then raise exception 'Tài khoản không hỗ trợ thông báo đẩy.';end if;
    v_kind:='student';
  end;

  if not private.app_is_phone_push_endpoint(v_endpoint) or length(v_endpoint)>1000 then raise exception 'Dịch vụ thông báo của trình duyệt không được hỗ trợ.';end if;
  if v_p256dh='' or v_auth='' or length(v_p256dh)>500 or length(v_auth)>500 then raise exception 'Khóa đăng ký thiết bị không hợp lệ.';end if;

  insert into public.app_push_subscriptions(endpoint,recipient_kind,recipient_id,p256dh,auth,user_agent,active,updated_at,last_seen_at,last_error,last_error_at)
  values(v_endpoint,v_kind,(v_me->>'id')::uuid,v_p256dh,v_auth,left(coalesce(p_user_agent,''),500),true,now(),now(),null,null)
  on conflict(endpoint) do update set
    recipient_kind=excluded.recipient_kind,
    recipient_id=excluded.recipient_id,
    p256dh=excluded.p256dh,
    auth=excluded.auth,
    user_agent=excluded.user_agent,
    active=true,
    updated_at=now(),
    last_seen_at=now(),
    last_error=null,
    last_error_at=null;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_create_push_test_notification(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_me jsonb;v_kind text;v_id uuid;
begin
  begin v_me:=public.app_me(p_token);v_kind:='manager';
  exception when others then
    v_me:=public.app_student_me(p_token);
    if coalesce(v_me->>'role','')<>'student' then raise exception 'Tài khoản không hỗ trợ thông báo đẩy.';end if;
    v_kind:='student';
  end;
  if not exists(select 1 from public.app_push_subscriptions s where s.recipient_kind=v_kind and s.recipient_id=(v_me->>'id')::uuid and s.active) then
    raise exception 'Tài khoản chưa có thiết bị bật thông báo điện thoại.';
  end if;
  insert into public.app_notifications(recipient_kind,recipient_id,notification_key,category,tone,icon,title,body,href,action_label,event_at)
  values(v_kind,(v_me->>'id')::uuid,'push-test:'||(v_me->>'id')||':'||extensions.gen_random_uuid(),'general','green','🔔','Thông báo thử · Học lái xe cùng Đạt','Nếu bạn thấy thông báo này ngoài màn hình, thiết bị đã nhận được thông báo đẩy.',case when v_kind='student' then '/hoc-vien.html' else '/?login=1' end,'Mở ứng dụng',now())
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function private.app_phone_push_actor(p_token text) returns jsonb
language plpgsql set search_path to public,extensions,pg_temp as $$
declare v_me jsonb; v_kind text;
begin
  begin
    v_me:=public.app_me(p_token);v_kind:='manager';
  exception when others then
    v_me:=public.app_student_me(p_token);
    if v_me->>'role' is distinct from 'student' then raise exception 'Tài khoản không hỗ trợ thông báo điện thoại.'; end if;
    v_kind:='student';
  end;
  return jsonb_build_object('kind',v_kind,'id',v_me->>'id');
end;$$;
revoke all on function private.app_phone_push_actor(text) from public,anon,authenticated;

create or replace function public.app_get_push_subscription_status(p_token text,p_endpoint text) returns jsonb
language plpgsql security definer set search_path to public,extensions,pg_temp as $$
declare v_actor jsonb;v_active boolean;
begin
  v_actor:=private.app_phone_push_actor(p_token);
  select s.active into v_active from public.app_push_subscriptions s
  where s.endpoint=p_endpoint and s.recipient_kind=v_actor->>'kind' and s.recipient_id::text=v_actor->>'id';
  return jsonb_build_object('active',coalesce(v_active,false));
end;$$;
revoke all on function public.app_get_push_subscription_status(text,text) from public;
grant execute on function public.app_get_push_subscription_status(text,text) to anon,authenticated,service_role;

create or replace function public.app_get_push_test_status(p_token text,p_notification_id uuid) returns jsonb
language plpgsql security definer set search_path to public,extensions,pg_temp as $$
declare v_actor jsonb;v_result jsonb;
begin
  v_actor:=private.app_phone_push_actor(p_token);
  select jsonb_build_object('state',coalesce(n.push_delivery_state,'legacy'),'sent',n.push_delivered_count,'failed',n.push_failed_count)
  into v_result from public.app_notifications n
  where n.id=p_notification_id and n.recipient_kind=v_actor->>'kind' and n.recipient_id::text=v_actor->>'id'
    and n.notification_key like 'push-test:%';
  if v_result is null then raise exception 'Không tìm thấy thông báo thử của tài khoản.'; end if;
  return v_result;
end;$$;
revoke all on function public.app_get_push_test_status(text,uuid) from public;
grant execute on function public.app_get_push_test_status(text,uuid) to anon,authenticated,service_role;

-- Reuse the configured authenticated database webhook without exposing or changing its credentials.
-- Only INSERT and an explicit retry-version update dispatch; delivery bookkeeping cannot recurse.
do $trigger$
declare v_def text;v_new text;
begin
  select pg_get_triggerdef(oid) into v_def from pg_trigger
  where tgrelid='public.app_notifications'::regclass and tgname='app_notifications_web_push' and not tgisinternal;
  if v_def is null then raise exception 'Missing configured notification webhook'; end if;
  if position('AFTER INSERT OR UPDATE OF push_dispatch_version' in v_def)=0 then
    v_new:=replace(v_def,'AFTER INSERT ON public.app_notifications','AFTER INSERT OR UPDATE OF push_dispatch_version ON public.app_notifications');
    if v_new=v_def then raise exception 'Unexpected configured notification webhook'; end if;
    drop trigger app_notifications_web_push on public.app_notifications;
    execute v_new;
  end if;
end;$trigger$;

create or replace function private.app_retry_phone_push() returns integer
language plpgsql set search_path to public,pg_temp as $$
declare v_count integer;
begin
  with ready as (
    select id from public.app_notifications
    where push_delivery_state in ('pending','retry','sending')
      and push_dispatch_version<2 and created_at>now()-interval '1 day'
      and push_delivery_at<now()-case when push_delivery_state='sending' then interval '10 minutes' else interval '2 minutes' end
    order by push_delivery_at limit 100 for update skip locked
  )
  update public.app_notifications n set push_delivery_state='pending',push_delivery_at=now(),
    push_dispatch_version=n.push_dispatch_version+1 from ready where n.id=ready.id;
  get diagnostics v_count=row_count;
  update public.app_notifications set push_delivery_state='failed',push_delivery_at=now()
  where push_delivery_state in ('pending','retry','sending')
    and (created_at<=now()-interval '1 day' or (push_dispatch_version>=2 and push_delivery_at<now()-interval '10 minutes'));
  return v_count;
end;$$;
revoke all on function private.app_retry_phone_push() from public,anon,authenticated;
select cron.schedule('hv-phone-push-retry','*/2 * * * *','select private.app_retry_phone_push()');

-- New registration alerts go to active admins; no phone numbers or identity documents in lock-screen messages.
create or replace function private.app_phone_registration_notice() returns trigger
language plpgsql security definer set search_path to public,pg_temp as $$
declare v_title text;v_body text;v_key text;
begin
  if tg_table_name='new_student_registrations' then
    v_title:='Có đăng ký học lái xe mới';
    v_body:=left(new.full_name,80)||' · Hạng '||coalesce(to_jsonb(new)->>'license_class','Chưa chọn');
    v_key:='new-registration:'||new.id::text;
  else
    v_title:='Có đăng ký bổ túc tay lái mới';
    v_body:=left(new.full_name,80)||' · Có yêu cầu bổ túc mới';
    v_key:='refresh-registration:'||new.id::text;
  end if;
  perform public.app_notify_managers_v2(null::uuid,v_key,'profile','blue','🔔',v_title,v_body,'/?login=1','Mở quản trị',new.created_at);
  return new;
end;$$;
revoke all on function private.app_phone_registration_notice() from public,anon,authenticated;
drop trigger if exists app_phone_new_registration_notice on public.new_student_registrations;
create trigger app_phone_new_registration_notice after insert on public.new_student_registrations for each row execute function private.app_phone_registration_notice();
drop trigger if exists app_phone_refresh_registration_notice on public.driving_refresh_registrations;
create trigger app_phone_refresh_registration_notice after insert on public.driving_refresh_registrations for each row execute function private.app_phone_registration_notice();

-- A direct practice session created by a manager (not the approval flow) also produces a server notice.
create or replace function private.app_phone_direct_training_notice() returns trigger
language plpgsql security definer set search_path to public,pg_temp as $$
begin
  if new.slot_id is null then
    perform public.app_notify_student_v2(new.student_id,'direct-session:'||new.id::text,'schedule','blue','📅',
      'Lịch học mới',public.app_schedule_label(new.session_type)||' · '||to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh','HH24:MI ngày DD/MM/YYYY')||
      case when nullif(new.location,'') is not null then ' · '||new.location else '' end,
      '/hoc-vien.html#trainingBooking','Xem lịch học',new.starts_at);
  end if;
  return new;
end;$$;
revoke all on function private.app_phone_direct_training_notice() from public,anon,authenticated;
drop trigger if exists app_phone_direct_training_notice on public.student_training_sessions;
create trigger app_phone_direct_training_notice after insert on public.student_training_sessions for each row execute function private.app_phone_direct_training_notice();

-- Training and examination status changes are sent once per change, scoped by the existing manager ownership rules.
create or replace function private.app_phone_training_progress_notice() returns trigger
language plpgsql security definer set search_path to public,pg_temp as $$
declare v_changes text[]:=array[]::text[];v_body text;v_key text;v_field text;v_label text;v_value text;
begin
  if new.deleted_at is not null then return new; end if;
  for v_field,v_label in select * from (values ('online_status','Lý thuyết online'),('cabin_status','Cabin'),('dat_status','DAT'),('graduation_status','Tốt nghiệp'),('exam_status','Sát hạch/nhận bằng')) fields(k,l)
  loop
    if v_field<>'exam_status' and private.app_is_motorcycle_license(new.license_class) then continue; end if;
    if to_jsonb(new)->>v_field is distinct from to_jsonb(old)->>v_field then
      v_value:=coalesce(nullif(to_jsonb(new)->>v_field,''),'Chưa cập nhật');
      v_changes:=array_append(v_changes,v_label||': '||left(v_value,100));
    end if;
  end loop;
  if cardinality(v_changes)>0 then
    v_body:=array_to_string(v_changes,' · ');
    v_key:='training-progress:'||new.id::text||':'||md5(v_body||coalesce(new.updated_at::text,clock_timestamp()::text));
    perform public.app_notify_student_v2(new.id,v_key,'training','blue','✓','Tiến độ đào tạo đã cập nhật',v_body,'/hoc-vien.html#studentProgress','Xem tiến độ',null);
    perform public.app_notify_managers_v2(new.id,'manager-'||v_key,'training','blue','✓','Cập nhật tiến độ: '||left(new.name,80),v_body,'/?login=1','Xem hồ sơ',null);
  end if;
  return new;
end;$$;
revoke all on function private.app_phone_training_progress_notice() from public,anon,authenticated;
drop trigger if exists app_phone_training_progress_notice on public.students;
create trigger app_phone_training_progress_notice after update of online_status,cabin_status,dat_status,graduation_status,exam_status on public.students for each row execute function private.app_phone_training_progress_notice();

notify pgrst,'reload schema';
