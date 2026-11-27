-- Additive notification center. Existing automated notices are intentionally unchanged.
create schema if not exists hv_notice_v5;
revoke all on schema hv_notice_v5 from public, anon, authenticated;
create table if not exists hv_notice_v5.notices (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(title) between 1 and 120),
 body text not null check (char_length(body) between 1 and 3000),
 category text not null check (category in ('study','exam','other')),
 level text not null check (level in ('normal','important','urgent')),
 audience text not null check (audience in ('all','course','license','student')),
 target text not null default '',
 place text not null default '' check (char_length(place)<=180),
 address text not null default '' check (char_length(address)<=300),
 maps_url text not null default '' check (char_length(maps_url)<=3000),
 popup boolean not null default false,
 require_ack boolean not null default false,
 pinned boolean not null default false,
 draft boolean not null default true,
 enabled boolean not null default false,
 starts_at timestamptz, ends_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 created_by uuid not null,
 check (starts_at is null or ends_at is null or starts_at<ends_at),
 check (level<>'normal' or not popup),
 check (level<>'urgent' or (popup and require_ack)),
 check (draft or category='other' or (length(btrim(place))>0 and length(btrim(address))>0 and length(maps_url)>0))
);
create table if not exists hv_notice_v5.recipients (
 notice_id uuid not null references hv_notice_v5.notices(id) on delete cascade,
 account_id uuid not null,
 seen_at timestamptz, ack_at timestamptz, reminded_at timestamptz,
 primary key(notice_id,account_id),
 check (ack_at is null or seen_at is not null)
);
create index if not exists hv_notice_v5_recipient_account on hv_notice_v5.recipients(account_id,notice_id);
create table if not exists hv_notice_v5.history (
 id bigint generated always as identity primary key,
 notice_id uuid not null references hv_notice_v5.notices(id) on delete cascade,
 actor_id uuid not null,
 action text not null,
 created_at timestamptz not null default now()
);
create index if not exists hv_notice_v5_history_notice on hv_notice_v5.history(notice_id,created_at desc);
create table if not exists hv_notice_v5.popup_sessions (
 token_hash bytea primary key,
 account_id uuid not null,
 claimed_at timestamptz not null default now()
);
alter table hv_notice_v5.notices enable row level security;
alter table hv_notice_v5.recipients enable row level security;
alter table hv_notice_v5.history enable row level security;
alter table hv_notice_v5.popup_sessions enable row level security;
revoke all on all tables in schema hv_notice_v5 from public,anon,authenticated;
revoke all on all sequences in schema hv_notice_v5 from public,anon,authenticated;

create or replace function hv_notice_v5.valid_map(p_url text) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select coalesce(
 length(p_url)<=3000
 and p_url !~ '[[:space:][:cntrl:]\\]'
 and p_url !~* '(%2e|%5c|/\.\.?(/|[?#]|$))'
 and (p_url ~* '^https://(www\.)?google\.com(\.vn)?/maps(/|[?#]|$)'
 or p_url ~* '^https://maps\.google\.com(\.vn)?(/|[?#]|$)'
 or p_url ~* '^https://maps\.app\.goo\.gl/[A-Za-z0-9_-]+/?([?#].*)?$'
 or p_url ~* '^https://goo\.gl/maps/[A-Za-z0-9_-]+/?([?#].*)?$'),false)
$$;
create or replace function hv_notice_v5.category_for(p_title text,p_category text) returns text
language sql immutable set search_path=pg_catalog as $$
 select case when p_category in ('study','exam') then p_category
 when translate(lower(regexp_replace(normalize(coalesce(p_title,''),NFD),U&'[\0300-\036F]','','g')),'đ','d') ~ '(lich thi|thi lai|lich sat hach|ky thi)' then 'exam'
 when translate(lower(regexp_replace(normalize(coalesce(p_title,''),NFD),U&'[\0300-\036F]','','g')),'đ','d') ~ '(lich hoc|lich dao tao|ca hoc|ca thuc hanh|buoi hoc|lich thuc hanh|lich cabin|lich dat)' then 'study'
 else 'other' end
$$;
create or replace function hv_notice_v5.notice_payload(n hv_notice_v5.notices) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'category',n.category,'level',n.level,'audience',n.audience,'target',n.target,'place',n.place,'address',n.address,'mapsUrl',n.maps_url,'popup',n.popup,'required',n.require_ack,'pin',n.pinned,'draft',n.draft,'enabled',n.enabled,'start',n.starts_at,'end',n.ends_at,'created',n.created_at,'updated',n.updated_at)
$$;
revoke all on all functions in schema hv_notice_v5 from public,anon,authenticated;

-- The existing app uses custom, hashed session tokens rather than Supabase Auth JWTs.
-- This RPC is the only API entrance; every branch authenticates through the existing session functions.
create or replace function public.app_notice_v5(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions,pg_temp
as $$
declare
 v_me jsonb; v_actor uuid; v_id uuid; v_n hv_notice_v5.notices%rowtype;
 v_old hv_notice_v5.notices%rowtype; v_exists boolean; v_changed boolean; v_reset boolean;
 v_title text; v_body text; v_category text; v_level text; v_audience text; v_target text;
 v_place text; v_address text; v_maps text; v_draft boolean; v_popup boolean; v_required boolean; v_pin boolean;
 v_start timestamptz; v_end timestamptz; v_count integer; v_hash bytea; v_payload jsonb;
begin
 if p_token is null or length(p_token)<16 or length(p_token)>512 then raise exception 'Phiên đăng nhập không hợp lệ.'; end if;
 if p_action in ('admin_list','admin_save','admin_toggle','admin_delete','admin_remind') then
  v_me:=public.app_require_admin(p_token);
  v_actor:=(v_me->>'id')::uuid;
  if coalesce((v_me->>'force_change_password')::boolean,false) then raise exception 'Cần đổi mật khẩu trước.'; end if;
  if p_action='admin_list' then
   return jsonb_build_object(
    'students',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',s.name,'course',coalesce(s.course,''),'license',coalesce(s.license_class,'')) order by s.name) from public.app_student_accounts a join public.students s on s.id::text=a.student_id where a.active and a.account_type='student' and s.deleted_at is null),'[]'::jsonb),
    'notices',coalesce((select jsonb_agg(hv_notice_v5.notice_payload(n)||jsonb_build_object(
      'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',r.account_id,'name',coalesce(s.name,'Tài khoản không còn hoạt động'),'seen',r.seen_at,'ack',r.ack_at,'reminded',r.reminded_at) order by s.name) from hv_notice_v5.recipients r left join public.app_student_accounts a on a.id=r.account_id left join public.students s on s.id::text=a.student_id where r.notice_id=n.id),'[]'::jsonb),
      'history',coalesce((select jsonb_agg(jsonb_build_object('at',h.created_at,'text',h.action) order by h.created_at desc) from (select * from hv_notice_v5.history where notice_id=n.id order by created_at desc limit 50) h),'[]'::jsonb)
    ) order by n.created_at desc) from (select * from hv_notice_v5.notices where deleted_at is null order by created_at desc limit 200) n),'[]'::jsonb));
  end if;
  v_id:=(p_data->>'id')::uuid;
  if v_id is null then raise exception 'Thiếu mã thông báo.'; end if;
  select * into v_old from hv_notice_v5.notices where id=v_id for update;
  v_exists:=found;
  if v_exists and v_old.deleted_at is not null then raise exception 'Thông báo đã xóa.'; end if;
  if p_action='admin_save' then
   v_title:=btrim(coalesce(p_data->>'title','')); v_body:=btrim(coalesce(p_data->>'body',''));
   v_category:=hv_notice_v5.category_for(v_title,coalesce(p_data->>'category','other'));
   v_level:=coalesce(p_data->>'level','normal'); v_audience:=coalesce(p_data->>'audience','all'); v_target:=btrim(coalesce(p_data->>'target',''));
   v_place:=btrim(coalesce(p_data->>'place','')); v_address:=btrim(coalesce(p_data->>'address','')); v_maps:=btrim(coalesce(p_data->>'mapsUrl',''));
   v_draft:=coalesce((p_data->>'draft')::boolean,true);
   v_popup:=v_level='urgent' or (v_level='important' and coalesce((p_data->>'popup')::boolean,false));
   v_required:=v_level='urgent' or coalesce((p_data->>'required')::boolean,false);
   v_pin:=coalesce((p_data->>'pin')::boolean,false);
   v_start:=nullif(p_data->>'start','')::timestamptz; v_end:=nullif(p_data->>'end','')::timestamptz;
   if length(v_title) not between 1 and 120 or length(v_body) not between 1 and 3000 then raise exception 'Vui lòng nhập tiêu đề và nội dung hợp lệ.'; end if;
   if v_level not in ('normal','important','urgent') or v_audience not in ('all','course','license','student') then raise exception 'Loại thông báo hoặc đối tượng không hợp lệ.'; end if;
   if v_audience='all' then v_target:=''; elsif v_target='' then raise exception 'Cần chọn đối tượng nhận.'; end if;
   if v_start is not null and v_end is not null and v_start>=v_end then raise exception 'Thời gian kết thúc phải sau bắt đầu.'; end if;
   if not v_draft and v_end is not null and v_end<=now() then raise exception 'Thời gian kết thúc đã qua.'; end if;
   if v_maps<>'' and not hv_notice_v5.valid_map(v_maps) then raise exception 'Đường dẫn Google Maps không hợp lệ.'; end if;
   if not v_draft and v_category in ('study','exam') and (v_place='' or v_address='' or not hv_notice_v5.valid_map(v_maps)) then raise exception 'Lịch học và lịch thi bắt buộc có tên địa điểm, địa chỉ cụ thể và Google Maps.'; end if;
   v_changed:=not v_exists or (v_old.title,v_old.body,v_old.category,v_old.level,v_old.audience,v_old.target,v_old.place,v_old.address,v_old.maps_url,v_old.popup,v_old.require_ack,v_old.pinned,v_old.draft,v_old.starts_at,v_old.ends_at)
    is distinct from (v_title,v_body,v_category,v_level,v_audience,v_target,v_place,v_address,v_maps,v_popup,v_required,v_pin,v_draft,v_start,v_end);
   v_reset:=not v_exists or (v_old.title,v_old.body,v_old.category,v_old.level,v_old.audience,v_old.target,v_old.place,v_old.address,v_old.maps_url,v_old.require_ack,v_old.draft)
    is distinct from (v_title,v_body,v_category,v_level,v_audience,v_target,v_place,v_address,v_maps,v_required,v_draft);
   if not v_changed then return jsonb_build_object('id',v_id,'unchanged',true); end if;
   insert into hv_notice_v5.notices(id,title,body,category,level,audience,target,place,address,maps_url,popup,require_ack,pinned,draft,enabled,starts_at,ends_at,created_by)
   values(v_id,v_title,v_body,v_category,v_level,v_audience,v_target,v_place,v_address,v_maps,v_popup,v_required,v_pin,v_draft,not v_draft,v_start,v_end,v_actor)
   on conflict(id) do update set title=excluded.title,body=excluded.body,category=excluded.category,level=excluded.level,audience=excluded.audience,target=excluded.target,place=excluded.place,address=excluded.address,maps_url=excluded.maps_url,popup=excluded.popup,require_ack=excluded.require_ack,pinned=excluded.pinned,draft=excluded.draft,enabled=excluded.enabled,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now();
   if v_reset then
    delete from hv_notice_v5.recipients where notice_id=v_id;
    if not v_draft then
     insert into hv_notice_v5.recipients(notice_id,account_id)
     select v_id,a.id from public.app_student_accounts a join public.students s on s.id::text=a.student_id
     where a.active and a.account_type='student' and s.deleted_at is null
     and (v_audience='all' or v_audience='course' and s.course=v_target or v_audience='license' and s.license_class=v_target or v_audience='student' and a.id::text=v_target);
     get diagnostics v_count=row_count;
     if v_count=0 then raise exception 'Không có học viên phù hợp để nhận thông báo.'; end if;
    end if;
   end if;
   insert into hv_notice_v5.history(notice_id,actor_id,action) values(v_id,v_actor,case when v_draft then 'Lưu nháp' when v_exists then 'Cập nhật và phát hành' else 'Phát hành' end);
   return jsonb_build_object('id',v_id,'recipient_count',(select count(*) from hv_notice_v5.recipients where notice_id=v_id));
  end if;
  if not v_exists then raise exception 'Không tìm thấy thông báo.'; end if;
  if p_action='admin_delete' then
   update hv_notice_v5.notices set deleted_at=now(),enabled=false,updated_at=now() where id=v_id;
   insert into hv_notice_v5.history(notice_id,actor_id,action) values(v_id,v_actor,'Ẩn/xóa thông báo');
  elsif p_action='admin_toggle' then
   if v_old.draft then raise exception 'Bản nháp cần được phát hành.'; end if;
   update hv_notice_v5.notices set enabled=not enabled,updated_at=now() where id=v_id;
   insert into hv_notice_v5.history(notice_id,actor_id,action) values(v_id,v_actor,case when v_old.enabled then 'Tắt hiển thị' else 'Bật hiển thị' end);
  elsif p_action='admin_remind' then
   if not v_old.enabled or v_old.draft or not v_old.require_ack or coalesce(v_old.starts_at,'-infinity'::timestamptz)>now() or coalesce(v_old.ends_at,'infinity'::timestamptz)<=now() then raise exception 'Thông báo chưa được phát hành hoặc đã hết hạn.'; end if;
   update hv_notice_v5.recipients set reminded_at=now() where notice_id=v_id and ack_at is null;
   get diagnostics v_count=row_count;
   insert into hv_notice_v5.history(notice_id,actor_id,action) values(v_id,v_actor,'Nhắc trong hệ thống cho '||v_count||' học viên chưa xác nhận');
   return jsonb_build_object('count',v_count);
  end if;
  return jsonb_build_object('ok',true);
 elsif p_action in ('student_list','student_claim','student_seen','student_ack','student_seen_all') then
  v_me:=public.app_student_me(p_token);
  if v_me->>'role'<>'student' or coalesce((v_me->>'force_change_password')::boolean,false) then raise exception 'Chỉ học viên có phiên hợp lệ được thực hiện.'; end if;
  v_actor:=(v_me->>'id')::uuid;
  if not exists(select 1 from public.app_student_accounts a join public.students s on s.id::text=a.student_id where a.id=v_actor and a.active and a.account_type='student' and s.deleted_at is null) then raise exception 'Hồ sơ học viên không hoạt động.'; end if;
  if p_action='student_list' then
   return coalesce((select jsonb_agg(hv_notice_v5.notice_payload(n)||jsonb_build_object('seen',r.seen_at,'ack',r.ack_at,'reminded',r.reminded_at) order by case n.level when 'urgent' then 0 when 'important' then 1 else 2 end,n.pinned desc,n.created_at desc)
    from (select n.* from hv_notice_v5.notices n join hv_notice_v5.recipients r on r.notice_id=n.id and r.account_id=v_actor where n.deleted_at is null and not n.draft and coalesce(n.starts_at,'-infinity'::timestamptz)<=now() and (n.enabled or r.seen_at is not null or r.ack_at is not null) order by n.created_at desc limit 200) n join hv_notice_v5.recipients r on r.notice_id=n.id and r.account_id=v_actor),'[]'::jsonb);
  elsif p_action='student_claim' then
   v_hash:=extensions.digest(convert_to(p_token,'UTF8'),'sha256');
   insert into hv_notice_v5.popup_sessions(token_hash,account_id) values(v_hash,v_actor) on conflict do nothing;
   if not found then return 'null'::jsonb; end if;
   select n.* into v_n from hv_notice_v5.notices n join hv_notice_v5.recipients r on r.notice_id=n.id and r.account_id=v_actor
   where n.deleted_at is null and n.enabled and not n.draft and n.popup and n.level<>'normal' and coalesce(n.starts_at,'-infinity'::timestamptz)<=now() and coalesce(n.ends_at,'infinity'::timestamptz)>now() and (n.require_ack and r.ack_at is null or not n.require_ack and r.seen_at is null)
   order by case n.level when 'urgent' then 0 else 1 end,n.pinned desc,n.created_at desc limit 1;
   if not found then return 'null'::jsonb; end if;
   return hv_notice_v5.notice_payload(v_n);
  elsif p_action='student_seen_all' then
   update hv_notice_v5.recipients r set seen_at=coalesce(seen_at,now()) from hv_notice_v5.notices n where n.id=r.notice_id and r.account_id=v_actor and n.deleted_at is null and n.enabled and not n.draft and coalesce(n.starts_at,'-infinity'::timestamptz)<=now() and coalesce(n.ends_at,'infinity'::timestamptz)>now();
   return jsonb_build_object('ok',true);
  else
   v_id:=(p_data->>'id')::uuid;
   update hv_notice_v5.recipients r set seen_at=coalesce(seen_at,now()),ack_at=case when p_action='student_ack' and n.require_ack then coalesce(ack_at,now()) else ack_at end
   from hv_notice_v5.notices n where n.id=r.notice_id and r.notice_id=v_id and r.account_id=v_actor and n.deleted_at is null and not n.draft and coalesce(n.starts_at,'-infinity'::timestamptz)<=now() and (n.enabled or r.seen_at is not null);
   if not found then raise exception 'Không tìm thấy thông báo dành cho tài khoản này.'; end if;
   return jsonb_build_object('ok',true);
  end if;
 end if;
 raise exception 'Thao tác không hợp lệ.';
end
$$;
revoke all on function public.app_notice_v5(text,text,jsonb) from public;
grant execute on function public.app_notice_v5(text,text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
