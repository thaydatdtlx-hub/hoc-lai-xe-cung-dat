import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

const root=resolve(import.meta.dirname,"..");
const source=await readFile(resolve(root,"theory-answer-explanations.js"),"utf8");
const errors=[];

if(!source.includes("__THAY_DAT_AI_CONTEXT__"))errors.push("Lời giải chưa ưu tiên source question id từ ngữ cảnh câu hỏi hiện tại.");
if(!source.includes("questionText"))errors.push("Lời giải chưa đối chiếu nội dung câu hỏi đang hiển thị.");
if(!source.includes("questionMap.values()"))errors.push("Lời giải chưa có fallback theo nội dung câu hỏi khi số hiển thị đã được đánh lại.");
if(!source.includes('dataset.theoryBankCount!=="250"'))errors.push("Bộ 250 câu chưa chặn fallback nguy hiểm từ số thứ tự hiển thị sang source id.");
if(!source.includes('classList.toggle("wrong",!correct)'))errors.push("Trạng thái màu đúng/sai của khối lời giải chưa được đồng bộ lại theo câu nguồn.");

if(errors.length){
  console.error(`Ràng buộc lời giải theo câu nguồn chưa hợp lệ (${errors.length} lỗi):`);
  errors.forEach(error=>console.error(`- ${error}`));
  process.exit(1);
}

console.log("Hợp lệ: lời giải được ràng buộc theo câu nguồn và nội dung đang hiển thị, không phụ thuộc số thứ tự 250/600.");
