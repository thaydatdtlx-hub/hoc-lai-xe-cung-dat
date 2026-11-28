-- Extend the existing V5 recipient modes without rewriting notices or student profiles.
alter table hv_notice_v5.notices drop constraint notices_audience_check;
alter table hv_notice_v5.notices add constraint notices_audience_check check (audience in ('all','course','license','student','selected'));

create or replace function public.app_notice_v5(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions,pg_temp
as $$
declare
 v_me jsonb; v_actor uuid; v_id uuid; v_n hv_notice_v5.notices%rowtype;
 v_old hv_notice_v5.notices%rowtype; v_exists boolean; v_changed boolean; v_reset boolean;
 v_title text; v_body text; v_category text; v_level text; v_audience text; v_target text;
 v_place text; v_address text; v_maps text; v_selected uuid[]; v_selection jsonb; v_draft boolean; v_popup boolean; v_required boolean; v_pin boolean;
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
   if v_level not in ('normal','important','urgent') or v_audience not in ('all','course','license','student','selected') then raise exception 'Loại thông báo hoặc đối tượng không hợp lệ.'; end if;
   if v_audience='selected' then
    begin
      if length(v_target)>100000 then raise exception 'Danh sách quá dài.'; end if;
      v_selection:=v_target::jsonb;
      if jsonb_typeof(v_selection) is distinct from 'array' or jsonb_array_length(v_selection)>2000 then raise exception 'Danh sách không hợp lệ.'; end if;
      if exists(select 1 from jsonb_array_elements(v_selection) j where jsonb_typeof(j)<>'string') then raise exception 'Mã học viên không hợp lệ.'; end if;
      select coalesce(array_agg(distinct x::uuid order by x::uuid),array[]::uuid[]) into v_selected from jsonb_array_elements_text(v_selection) x;
      if array_position(v_selected,null) is not null then raise exception 'Mã học viên không hợp lệ.'; end if;
    exception when others then raise exception 'Danh sách học viên được chọn không hợp lệ.'; end;
    v_target:=to_jsonb(v_selected)::text;
    if not v_draft then
      if cardinality(v_selected)=0 then raise exception 'Cần chọn ít nhất một học viên.'; end if;
      select count(*) into v_count from public.app_student_accounts a join public.students s on s.id::text=a.student_id
       where a.id=any(v_selected) and a.active and a.account_type='student' and s.deleted_at is null;
      if v_count<>cardinality(v_selected) then raise exception 'Một hoặc nhiều tài khoản không còn hoạt động. Vui lòng tải lại danh sách và chọn lại.'; end if;
    end if;
   elsif v_audience='all' then v_target:=''; elsif v_target='' then raise exception 'Cần chọn đối tượng nhận.'; end if;
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
     and (v_audience='all' or v_audience='course' and s.course=v_target or v_audience='license' and s.license_class=v_target or v_audience='student' and a.id::text=v_target or v_audience='selected' and a.id=any(v_selected));
     get diagnostics v_count=row_count;
     if v_count=0 then raise exception 'Không có học viên phù hợp để nhận thông báo.'; end if;
     if v_audience='selected' and v_count<>cardinality(v_selected) then raise exception 'Danh sách học viên đã thay đổi. Vui lòng thử lại.'; end if;
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
