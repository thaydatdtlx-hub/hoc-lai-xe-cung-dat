import {readFileSync} from "node:fs";
import {strict as assert} from "node:assert";
import {SCHEDULE_FIELDS,isMotorcycleLicense} from "../schedule-data.js";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const schedule=read("schedule.js");
const course=read("course-schedule-sync-v2.js");
const migration=read("supabase/migrations/20261124_motorcycle_exam_only_schedule.sql");
const correction=read("supabase/migrations/20261124_motorcycle_staff_course_guard.sql");
const sessionGuard=read("supabase/migrations/20261124_motorcycle_car_session_guard.sql");

for(const value of ["A1","A","Hạng A1","Xe máy hạng A"]){
  assert.equal(isMotorcycleLicense(value),true,"Must recognize motorcycle class: "+value);
}
for(const value of ["B","B số tự động","B số cơ khí","C1","A1/B"]){
  assert.equal(isMotorcycleLicense(value),false,"Should not classify car/mixed class as motorcycle: "+value);
}
assert.equal(SCHEDULE_FIELDS.filter(field=>field.key==="exam").length,1);
assert.ok(schedule.includes('return MILESTONE_FIELDS.filter(field=>field.key==="exam")'),
  "A1/A personal milestone editor must show only exam");
assert.ok(schedule.includes('scheduleFieldsForStudent(student).filter(field=>schedule.dates?.[field.key])'),
  "Existing car-only motorcycle milestones must not render as events");
assert.ok(schedule.includes('!isMotorcycleLicense(event.student.license_class)'),
  "Old training sessions must be hidden for A1/A without deleting them");
assert.ok(schedule.includes('if(motorcycle&&field.key==="exam"')===false,
  "Test must use actual conditional expression");
assert.ok(schedule.includes('motorcycle&&field.key==="exam"?"required":""'),
  "Date/time and venue must both be required in A1/A exam fields");
assert.ok(schedule.includes('if(!schedule.locations.exam)'),
  "Do not accept missing exam location");
assert.ok(schedule.includes('note:previous.note||""'),
  "Hidden legacy notes must be preserved");
assert.ok(schedule.includes('schedule.source==="course"'),
  "Staff must be informed about centrally managed course schedules");
assert.ok(course.includes('if(isA1OrACourse(members))return SCHEDULE_FIELDS.filter(field=>field.key==="exam")'),
  "A1/A course editor must have exam-only fields");
assert.ok(course.includes('if(isMixedLicenseCourse(members))return []'),
  "Mixed car and motorcycle courses must not show editable fields");
assert.ok(course.includes('saveButton.disabled=isMixedLicenseCourse(members)'),
  "Save action disabled for mixed courses");
assert.ok(course.includes('if(!schedule.locations.exam)throw new Error'),
  "Course exam must require location");
assert.ok(migration.includes("private.app_is_motorcycle_license")&&migration.includes("v_motorcycle_count < v_member_count"),
  "Backend must block mixed courses");
assert.ok(migration.includes("if private.app_is_motorcycle_license(p_license_class)"),
  "Backend must preserve old motorcycle training data");
assert.ok(correction.includes("Lịch Thi sát hạch A1/A đang được lập chung"),
  "Staff must not silently overwrite centrally managed course dates");
assert.ok(sessionGuard.includes("before insert or update of student_id, session_type"),"Table trigger must intercept motorcycle car-session creation and reassignment");
assert.ok(sessionGuard.includes("private.app_is_motorcycle_license(v_license)"),"Table trigger must use motorcycle-class check");
console.log("PASS: A1/A chỉ có Thi sát hạch ngày/giờ và địa điểm; B/C1 giữ lịch đầy đủ; lịch cũ không bị xóa; khóa trộn bị chặn.");
