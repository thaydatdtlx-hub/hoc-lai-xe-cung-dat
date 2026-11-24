-- Additional defense in depth: motorcycle A1/A students cannot be newly assigned
-- to car training sessions (familiarization, DAT, practice).
-- Historical sessions are not deleted or changed by this migration.
create or replace function private.app_block_motorcycle_car_sessions()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_license text;
begin
  select s.license_class into v_license
  from public.students s where s.id=new.student_id;
  if private.app_is_motorcycle_license(v_license) then
    raise exception 'Học viên A1/A chỉ có lịch Thi sát hạch; không được tạo ca học thực hành ô tô.';
  end if;
  return new;
end;
$function$;

drop trigger if exists app_block_motorcycle_car_sessions_trigger on public.student_training_sessions;
create trigger app_block_motorcycle_car_sessions_trigger
before insert or update of student_id, session_type
on public.student_training_sessions
for each row
execute function private.app_block_motorcycle_car_sessions();
