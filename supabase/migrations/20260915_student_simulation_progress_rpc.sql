-- Applied to project pkzxkvcncipfszeukpwu as migration student_simulation_progress_rpc.
-- These functions reuse the existing opaque student session token through app_student_me.

create or replace function public.app_student_get_simulation_progress(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_me jsonb; v_account_id uuid; v_result jsonb;
begin
  v_me:=public.app_student_me(p_token); v_account_id:=(v_me->>'id')::uuid;
  select jsonb_build_object(
    'account_id',v_account_id,
    'progress_data',coalesce(p.progress_data,'{"lastId":1,"scenarios":{}}'::jsonb),
    'completed_count',coalesce(p.completed_count,0),'mastered_count',coalesce(p.mastered_count,0),
    'total_attempts',coalesce(p.total_attempts,0),'last_scenario_id',coalesce(p.last_scenario_id,1),
    'last_activity',p.last_activity,
    'history',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'score',e.score,'total',e.total,'passed',e.passed,'scenario_ids',e.scenario_ids,'scenario_scores',e.scenario_scores,'elapsed_seconds',e.elapsed_seconds,'submitted_at',e.submitted_at) order by e.submitted_at desc) from (select * from public.app_simulation_exam_attempts where account_id=v_account_id order by submitted_at desc limit 50)e),'[]'::jsonb)
  ) into v_result from (select 1)seed left join public.app_simulation_progress p on p.account_id=v_account_id;
  return v_result;
end;$$;

create or replace function public.app_student_save_simulation_progress(p_token text,p_progress_data jsonb,p_completed_count integer,p_mastered_count integer,p_total_attempts integer,p_last_scenario_id integer)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_me jsonb; v_account_id uuid;
begin
  v_me:=public.app_student_me(p_token); v_account_id:=(v_me->>'id')::uuid;
  if jsonb_typeof(p_progress_data)<>'object' then raise exception 'Dữ liệu tiến độ không hợp lệ.'; end if;
  if p_completed_count not between 0 and 120 or p_mastered_count not between 0 and 120 or p_mastered_count>p_completed_count then raise exception 'Số lượng tiến độ không hợp lệ.'; end if;
  if p_total_attempts<0 or p_total_attempts>1000000 then raise exception 'Số lượt luyện không hợp lệ.'; end if;
  if p_last_scenario_id not between 1 and 120 then raise exception 'Tình huống cuối không hợp lệ.'; end if;
  insert into public.app_simulation_progress(account_id,progress_data,completed_count,mastered_count,total_attempts,last_scenario_id,last_activity,updated_at)
  values(v_account_id,p_progress_data,p_completed_count,p_mastered_count,p_total_attempts,p_last_scenario_id,now(),now())
  on conflict(account_id) do update set progress_data=excluded.progress_data,completed_count=excluded.completed_count,mastered_count=excluded.mastered_count,total_attempts=excluded.total_attempts,last_scenario_id=excluded.last_scenario_id,last_activity=now(),updated_at=now();
  return jsonb_build_object('ok',true,'account_id',v_account_id,'updated_at',now());
end;$$;

create or replace function public.app_student_save_simulation_exam(p_token text,p_score integer,p_scenario_ids jsonb,p_scenario_scores jsonb,p_elapsed_seconds integer default 0)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_me jsonb; v_account_id uuid; v_id uuid; v_count integer; v_distinct integer;
begin
  v_me:=public.app_student_me(p_token); v_account_id:=(v_me->>'id')::uuid;
  if p_score not between 0 and 50 then raise exception 'Điểm thi không hợp lệ.'; end if;
  if jsonb_typeof(p_scenario_ids)<>'array' or jsonb_array_length(p_scenario_ids)<>10 then raise exception 'Đề thi phải có 10 tình huống.'; end if;
  if jsonb_typeof(p_scenario_scores)<>'array' or jsonb_array_length(p_scenario_scores)<>10 then raise exception 'Kết quả phải có 10 tình huống.'; end if;
  select count(*),count(distinct value::integer) into v_count,v_distinct from jsonb_array_elements_text(p_scenario_ids);
  if v_count<>10 or v_distinct<>10 or exists(select 1 from jsonb_array_elements_text(p_scenario_ids)x where x.value::integer not between 1 and 120) then raise exception 'Danh sách tình huống không hợp lệ.'; end if;
  if p_elapsed_seconds<0 or p_elapsed_seconds>3600 then raise exception 'Thời gian làm bài không hợp lệ.'; end if;
  insert into public.app_simulation_exam_attempts(account_id,score,total,passed,scenario_ids,scenario_scores,elapsed_seconds)
  values(v_account_id,p_score,50,p_score>=35,p_scenario_ids,p_scenario_scores,p_elapsed_seconds) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id,'score',p_score,'total',50,'passed',p_score>=35);
end;$$;

revoke all on function public.app_student_get_simulation_progress(text) from public;
revoke all on function public.app_student_save_simulation_progress(text,jsonb,integer,integer,integer,integer) from public;
revoke all on function public.app_student_save_simulation_exam(text,integer,jsonb,jsonb,integer) from public;
grant execute on function public.app_student_get_simulation_progress(text) to anon,authenticated;
grant execute on function public.app_student_save_simulation_progress(text,jsonb,integer,integer,integer,integer) to anon,authenticated;
grant execute on function public.app_student_save_simulation_exam(text,integer,jsonb,jsonb,integer) to anon,authenticated;
