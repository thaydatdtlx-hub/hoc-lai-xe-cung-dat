import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {isMotorcycleLicense} from "../schedule-data.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const schedule=read("schedule.js"),html=read("lich-dao-tao.html"),api=read("api/student-rpc.js");
const sql=read("supabase/migrations/20261125_slot_student_audience.sql");
const source=schedule.slice(schedule.indexOf("export function eligibleSlotStudents("),schedule.indexOf("let slotSelectedStudentIds=")).replace(/export function/g,"function");
const context={isMotorcycleLicense,normalize:value=>String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d")};
runInNewContext(source,context);
const students=[
{id:"1",name:"Nguyễn Văn An",student_code:"HV01",course:"K1",license_class:"B số cơ khí"},
{id:"2",name:"Trần Minh",student_code:"HV02",course:"K2",license_class:"C1"},
{id:"3",name:"Nguyễn Bình",student_code:"HV03",course:"K1",license_class:"A1"},
{id:"4",name:"Lê Anh",student_code:"HV04",course:"K1",license_class:"A"},
{id:"5",name:"Hồ Sơ Cũ",course:"K1",license_class:"B",deleted_at:"2026-01-01"},
{id:"6",name:"Chưa cập nhật",license_class:""}
];
assert.deepEqual(Array.from(context.eligibleSlotStudents(students),s=>s.id),["1","2"]);
assert.deepEqual(Array.from(context.filterSlotStudents(students,{search:"nguyen van an",course:"K1"}),s=>s.id),["1"]);
assert.deepEqual(Array.from(context.filterSlotStudents(students,{search:"hv02",license:"C1"}),s=>s.id),["2"]);
assert.deepEqual(Array.from(context.filterSlotStudents(students,{license:"A1"})),[]);
for(const id of ["slotAudienceMode","slotAudienceSearch","slotAudienceLicense","slotAudienceCourse","slotAudienceSelectAll","slotAudienceClear","slotAudienceList"])assert.ok(html.includes('id="'+id+'"')&&schedule.includes('"'+id+'"'),id);
assert.ok(schedule.includes('p_allowed_student_ids:allowedIds'));
assert.ok(schedule.includes('slotSelectedStudentIds.clear()'));
assert.ok(api.includes('"app_admin_save_training_slot_audience"'));
assert.ok(sql.includes("perform public.app_require_admin(p_token)")&&sql.includes("slot.allowed_student_ids is null or")&&sql.includes("v_student_id = any(v_slot.allowed_student_ids)")&&sql.includes("v_request.student_id = any(v_slot.allowed_student_ids)"));
console.log("PASS: chọn hàng loạt học viên, tìm kiếm không dấu, lọc khóa/hạng, loại A1/A; quyền đăng ký và duyệt được kiểm soát ở RPC.");
