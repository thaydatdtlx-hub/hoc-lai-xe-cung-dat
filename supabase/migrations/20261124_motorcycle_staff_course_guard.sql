-- Prevent silent overwrites of individual motorcycle exam dates by shared course schedules.
CREATE OR REPLACE FUNCTION public.app_staff_save_student_schedule(p_token text, p_student_id text, p_notes text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me jsonb; v_id uuid; v_name text;
  v_license text; v_old_notes text; v_course text; v_old jsonb; v_new jsonb;
begin
  v_me:=public.app_me(p_token);
  if v_me->>'role'<>'user' then raise exception 'Chỉ nhân viên sử dụng chức năng lập lịch riêng này.'; end if;
  if pg_catalog.length(coalesce(p_notes,''))>30000 then raise exception 'Nội dung lịch quá dài.'; end if;
  select id,name,license_class,notes,course into v_id,v_name,v_license,v_old_notes,v_course from public.students
  where id::text=pg_catalog.btrim(coalesce(p_student_id,'')) and owner_id=(v_me->>'id')::uuid
    and deleted_at is null for update;
  if v_id is null then raise exception 'Chỉ được quản lý lịch của học viên do tài khoản này nhập.'; end if;
  if private.app_is_motorcycle_license(v_license)
    and private.app_course_key(v_course) <> ''
    and exists (select 1 from private.app_course_schedules cs
                where cs.course_key=private.app_course_key(v_course)) then
    raise exception 'Lịch Thi sát hạch A1/A đang được lập chung cho khóa. Vui lòng liên hệ Quản trị viên để cập nhật lịch chung.';
  end if;
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
