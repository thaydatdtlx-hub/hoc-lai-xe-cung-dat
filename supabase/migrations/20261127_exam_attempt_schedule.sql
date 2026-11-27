-- Lịch thi theo từng học viên, mỗi kỳ thi lưu từng lần; không thay đổi mốc thi chung theo khóa.
create table if not exists public.student_exam_schedule_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  exam_type text not null check (exam_type in ('graduation','exam')),
  attempt_no integer not null check (attempt_no between 1 and 99),
  starts_at timestamptz not null,
  location text not null check (length(btrim(location)) between 1 and 255),
  result text not null default 'scheduled' check (result in ('scheduled','passed','failed','absent','cancelled')),
  failed_parts text[] not null default '{}'::text[],
  note text not null default '',
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, exam_type, attempt_no),
  constraint exam_schedule_note_length check (length(note) <= 1000)
);
create index if not exists student_exam_schedule_attempts_student_date_idx
  on public.student_exam_schedule_attempts(student_id, starts_at);
alter table public.student_exam_schedule_attempts enable row level security;
revoke all on public.student_exam_schedule_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.student_exam_schedule_attempts to service_role;

-- Nhận diện và hiển thị cả lịch thi lần 1 đã lưu trong ghi chú của học viên.
-- Lịch cũ vẫn nằm nguyên trong notes, không được ghi đè hoặc xóa.
create or replace function public.app_list_exam_schedule_attempts(p_token text, p_student_id text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me jsonb;
  v_kind text := 'manager';
  v_result jsonb;
begin
  begin
    v_me := public.app_me(p_token);
    if coalesce(v_me->>'role','') not in ('admin','user') then
      raise exception 'Tài khoản không có quyền xem lịch thi.';
    end if;
  exception when others then
    v_me := public.app_student_me(p_token);
    v_kind := 'student';
    if coalesce(v_me->>'role','') <> 'student' then
      return '[]'::jsonb;
    end if;
  end;

  with visible_students as (
    select s.*
      from public.students s
     where s.deleted_at is null
       and (
         (v_kind='student' and s.id::text=v_me->>'student_id')
         or
         (v_kind='manager'
           and (v_me->>'role'='admin' or s.owner_id::text=v_me->>'id')
           and (nullif(btrim(coalesce(p_student_id,'')),'') is null or s.id::text=btrim(p_student_id)))
       )
  ), saved as (
    select jsonb_build_object(
      'id',a.id::text,'source','saved','student_id',a.student_id::text,
      'exam_type',a.exam_type,'attempt_no',a.attempt_no,'starts_at',a.starts_at,
      'location',a.location,'result',a.result,'failed_parts',to_jsonb(a.failed_parts),
      'note',a.note,'updated_at',a.updated_at
    ) as item
    from public.student_exam_schedule_attempts a
    join visible_students s on s.id=a.student_id
  ), legacy as (
    select jsonb_build_object(
      'id','legacy:'||s.id::text||':'||k.exam_type,'source','legacy',
      'student_id',s.id::text,'exam_type',k.exam_type,'attempt_no',1,
      'starts_at',payload.data->'dates'->>k.exam_type,
      'location',coalesce(payload.data->'locations'->>k.exam_type,''),
      'result',case
        when lower(coalesce(case when k.exam_type='exam' then s.exam_status else s.graduation_status end,'')) like '%rớt%'
          or lower(coalesce(case when k.exam_type='exam' then s.exam_status else s.graduation_status end,'')) like '%không đạt%' then 'failed'
        when lower(coalesce(case when k.exam_type='exam' then s.exam_status else s.graduation_status end,'')) like '%đậu%'
          or lower(coalesce(case when k.exam_type='exam' then s.exam_status else s.graduation_status end,'')) like '%đã nhận bằng%' then 'passed'
        else 'scheduled'
      end,
      'failed_parts','[]'::jsonb,'note',coalesce(payload.data->>'note',''),
      'profile_result',case when k.exam_type='exam' then s.exam_status else s.graduation_status end
    ) as item
    from visible_students s
    cross join (values('graduation'),('exam')) as k(exam_type)
    cross join lateral (select public.app_schedule_payload(s.notes) as data) payload
    where (k.exam_type='exam' or not private.app_is_motorcycle_license(s.license_class))
      and nullif(payload.data->'dates'->>k.exam_type,'') is not null
      and not exists(
        select 1 from public.student_exam_schedule_attempts recorded
         where recorded.student_id=s.id and recorded.exam_type=k.exam_type and recorded.attempt_no=1
      )
  )
  select coalesce(jsonb_agg(item order by item->>'starts_at',item->>'student_id',item->>'exam_type',item->>'attempt_no'),'[]'::jsonb)
    into v_result
    from (select item from saved union all select item from legacy) all_rows;
  return v_result;
end
$fn$;
revoke all on function public.app_list_exam_schedule_attempts(text,text) from public;
grant execute on function public.app_list_exam_schedule_attempts(text,text) to anon,authenticated,service_role;

-- Tạo/sửa lịch thi riêng: số lần kế tiếp luôn được kiểm tra trong giao dịch.
-- Nhân viên chỉ sửa lịch của học viên do mình phụ trách; học viên chỉ được xem.
create or replace function public.app_save_exam_schedule_attempt(
  p_token text, p_student_id text, p_exam_type text, p_attempt_no integer,
  p_starts_at timestamptz, p_location text, p_result text,
  p_failed_parts text[], p_note text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_me jsonb;
  v_student public.students%rowtype;
  v_record public.student_exam_schedule_attempts%rowtype;
  v_existing public.student_exam_schedule_attempts%rowtype;
  v_legacy boolean := false;
  v_last integer := 0;
  v_status text := coalesce(nullif(btrim(p_result),''),'scheduled');
  v_location text := btrim(coalesce(p_location,''));
  v_note text := btrim(coalesce(p_note,''));
  v_parts text[] := coalesce(p_failed_parts,'{}'::text[]);
  v_name text;
begin
  v_me := public.app_me(p_token);
  if coalesce(v_me->>'role','') not in ('admin','user') then
    raise exception 'Chỉ Quản trị viên hoặc Nhân viên phụ trách mới được lập lịch thi.';
  end if;
  if p_student_id is null or p_student_id !~* '^[0-9a-f-]{36}$' then
    raise exception 'Mã học viên không hợp lệ.';
  end if;
  select * into v_student from public.students
   where id::text=p_student_id and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy học viên đang học.'; end if;
  if v_me->>'role'<>'admin' and v_student.owner_id::text is distinct from v_me->>'id' then
    raise exception 'Bạn không được sửa lịch của học viên do nhân viên khác quản lý.';
  end if;
  if p_exam_type not in ('graduation','exam') then
    raise exception 'Chỉ hỗ trợ Thi tốt nghiệp và Thi sát hạch.';
  end if;
  if p_exam_type='graduation' and private.app_is_motorcycle_license(v_student.license_class) then
    raise exception 'Hạng A1/A chỉ có Thi sát hạch, không có Thi tốt nghiệp.';
  end if;
  if p_attempt_no is null or p_attempt_no not between 1 and 99 then
    raise exception 'Số lần thi không hợp lệ.';
  end if;
  if p_starts_at is null then raise exception 'Vui lòng chọn ngày và giờ thi.'; end if;
  if length(v_location) not between 1 and 255 then
    raise exception 'Vui lòng nhập địa điểm/hình thức thi (tối đa 255 ký tự).';
  end if;
  if length(v_note)>1000 then raise exception 'Ghi chú không được quá 1000 ký tự.'; end if;
  if v_status not in ('scheduled','passed','failed','absent','cancelled') then
    raise exception 'Kết quả thi không hợp lệ.';
  end if;
  if exists (select 1 from unnest(v_parts) part
             where part not in ('theory','simulation','yard','road')) then
    raise exception 'Phần thi chưa đạt không hợp lệ.';
  end if;
  if v_status<>'failed' or p_exam_type='graduation' then v_parts:='{}'::text[]; end if;
  if private.app_is_motorcycle_license(v_student.license_class)
     and ('simulation'=any(v_parts) or 'road'=any(v_parts)) then
    raise exception 'Hạng A1/A không có phần thi Mô phỏng hoặc Đường trường.';
  end if;

  -- Khóa học viên; cả hai luồng ghi đều chịu cùng một khóa để không trùng lần thi.
  perform pg_advisory_xact_lock(hashtextextended(v_student.id::text||':'||p_exam_type,0));
  select * into v_existing
    from public.student_exam_schedule_attempts
   where student_id=v_student.id and exam_type=p_exam_type and attempt_no=p_attempt_no
   for update;
  select coalesce(max(attempt_no),0) into v_last
    from public.student_exam_schedule_attempts
   where student_id=v_student.id and exam_type=p_exam_type;
  v_legacy := nullif(public.app_schedule_payload(v_student.notes)->'dates'->>p_exam_type,'') is not null;
  if v_existing.id is null then
    if not ((p_attempt_no=1 and v_legacy and v_last=0)
      or p_attempt_no=greatest(v_last,case when v_legacy then 1 else 0 end)+1) then
      raise exception 'Số lần thi chưa đúng. Vui lòng tải lại lịch thi.';
    end if;
    if exists (
      select 1 from public.student_exam_schedule_attempts
       where student_id=v_student.id and exam_type=p_exam_type and result='passed'
    ) then
      raise exception 'Học viên đã đậu kỳ thi này; không thể lập lịch thi lại.';
    end if;
    insert into public.student_exam_schedule_attempts
      (student_id,exam_type,attempt_no,starts_at,location,result,failed_parts,note,created_by)
    values
      (v_student.id,p_exam_type,p_attempt_no,p_starts_at,v_location,v_status,v_parts,v_note,(v_me->>'id')::uuid)
    returning * into v_record;
  else
    update public.student_exam_schedule_attempts set
      starts_at=p_starts_at,location=v_location,result=v_status,
      failed_parts=v_parts,note=v_note,updated_at=now()
    where id=v_existing.id returning * into v_record;
  end if;

  v_name := case p_exam_type when 'graduation' then 'tốt nghiệp' else 'sát hạch' end;
  if v_existing.id is null or
     v_existing.starts_at is distinct from v_record.starts_at or
     v_existing.location is distinct from v_record.location or
     v_existing.result is distinct from v_record.result then
    perform public.app_notify_student_v2(
      v_student.id,'exam-schedule:'||v_record.id::text||':'||gen_random_uuid()::text,
      'schedule',case when v_record.result='passed' then 'green' when v_record.result='failed' then 'orange' else 'blue' end,
      case when p_exam_type='graduation' then '🎓' else '🏁' end,
      case when v_record.result='scheduled' then 'Lịch thi '||v_name||' lần '||p_attempt_no
           else 'Cập nhật kỳ thi '||v_name||' lần '||p_attempt_no end,
      case v_record.result
        when 'passed' then 'Kết quả: Đậu. '
        when 'failed' then 'Kết quả: Rớt. '
        when 'absent' then 'Trạng thái: Vắng thi. '
        when 'cancelled' then 'Lịch thi đã hủy. '
        else '' end ||
        to_char(v_record.starts_at at time zone 'Asia/Ho_Chi_Minh','HH24:MI ngày DD/MM/YYYY') ||
        ' · '||v_record.location,
      '/lich-dao-tao.html','Xem lịch thi',v_record.starts_at
    );
  end if;
  return jsonb_build_object(
    'id',v_record.id::text,'student_id',v_record.student_id::text,
    'exam_type',v_record.exam_type,'attempt_no',v_record.attempt_no,
    'starts_at',v_record.starts_at,'location',v_record.location,
    'result',v_record.result,'failed_parts',to_jsonb(v_record.failed_parts),
    'note',v_record.note,'source','saved'
  );
end
$fn$;
revoke all on function public.app_save_exam_schedule_attempt(text,text,text,integer,timestamptz,text,text,text[],text) from public;
grant execute on function public.app_save_exam_schedule_attempt(text,text,text,integer,timestamptz,text,text,text[],text)
to anon,authenticated,service_role;
