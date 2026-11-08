# รูปแบบ declarative Record Preset และลำดับการตั้งค่า

Labels: wayfinder:grilling
Type: grilling

## Question

Record Preset ที่ผู้ใช้เขียนเองมีข้อมูลอะไรได้บ้าง ใช้รูปแบบไฟล์ใด เลือก handler/mode/upstream และตั้งค่าเฉพาะ handler อย่างไร? จะเป็นไฟล์ตั้งค่าที่สมบูรณ์ในตัวหรืออ้างอิง preset อื่นได้ และ CLI options มีลำดับความสำคัญอย่างไรเมื่อค่าซ้ำกัน? กำหนดการเลือก preset สำเร็จรูปกับไฟล์ผู้ใช้ โดยไม่เปลี่ยน declarative preset ให้เป็นโค้ด handler หรือภาษาแปลง event

## Comments

- ผู้ใช้ยืนยัน: Handler เป็นส่วนที่ผู้พัฒนาเขียน และแต่ละ handler อาจเลือกบันทึกข้อมูลต่างกัน; Record Preset มี default สำเร็จรูปได้ แต่ผู้ใช้เขียนเองเป็นไฟล์ declarative ได้
- สำหรับตัวอย่าง OTel ช่วงแรก ผู้ใช้ยืนยันแนวทาง HTTP request/response capture ก่อน ไม่กำหนดให้แตก payload เป็น event ตามความหมาย OTel
- ผู้ใช้ยังเรียก handler ตรง ๆ ได้ ไม่บังคับผ่าน preset
- ผู้ใช้เลือก plain YAML สำหรับไฟล์ Record Preset โดยไม่ต้องมี extends/การสืบทอด preset
- ผู้ใช้ยืนยันลำดับความสำคัญ: CLI options ที่ผู้ใช้ระบุชัดเจน → ค่าใน preset → default ของ handler; default ที่ตัว CLI parser เติมให้ไม่ควรกลบค่าจาก preset
- ผู้ใช้ยืนยันว่า preset เก็บวิธีรับ/ส่งต่อ ไม่เก็บ path ของ Recording; ระบุ output path จาก CLI ในแต่ละครั้ง
- ถ้าไม่ระบุ output path ให้สร้าง Recording ใต้ working directory ปัจจุบันที่ `.tape/{timestamp}-{random_word}.jsonl`; ถ้าระบุ ให้ใช้ path นั้น
- ผู้ใช้ยืนยันไม่เขียนทับหรือ append ไฟล์เดิม: path ที่ระบุมีอยู่แล้วให้ error; ชื่อที่สร้างอัตโนมัติชนให้สร้างชื่อใหม่ การสร้างไฟล์ต้องไม่เปิดช่องเขียนทับจาก race
- ผู้ใช้ยืนยันสร้าง parent directory ที่ยังไม่มีให้อัตโนมัติทั้ง default และ explicit output path; timestamp ใช้ UTC เรียงตามเวลาได้และไม่มี `:` เพื่อใช้ข้ามระบบ
- ผู้ใช้ยืนยันแยก `--preset otel` สำหรับ preset สำเร็จรูป กับ `--preset-file ./capture.yaml` สำหรับไฟล์ผู้ใช้ โดยเลือกได้อย่างใดอย่างหนึ่ง ไม่เดาชื่อกับ path และไม่ merge สองแหล่ง
- ผู้ใช้ยืนยันโครงสร้าง YAML: `handler` เป็น selector และ `options` เป็นค่าของ handler นั้น ไม่บังคับ handler ทุกชนิดมี mode/upstream
- ผู้ใช้ยืนยันตรวจ schema ตาม handler ที่เลือก; handler แต่ละตัวกำหนด schema ของ options ของตนเอง ค่าไม่รองรับต้อง error ไม่ข้ามเงียบ
- ข้อกำหนดลำดับการทำงานสำหรับ spec: ตรวจโครงสร้าง preset และหา handler ให้ได้ก่อน จากนั้นประกอบค่าตาม precedence และตรวจ resolved options ด้วย schema ของ handler ก่อนเปิด server/เชื่อมต่อ upstream/สร้างไฟล์ Recording; handler ไม่รู้จักหรือค่าไม่ถูกต้องให้รายงาน field และสาเหตุ ใช้การตรวจแบบเดียวกันทั้ง preset และการเรียก handler ตรง ๆ
- ผู้ใช้ยืนยัน HTTP options ต้องควบคุมการปิดบัง headers ได้: ค่าเริ่มต้นปิดบัง Authorization, Cookie และ Set-Cookie; เปิด/ปิดได้และเพิ่ม blacklist ได้ ชื่อ field YAML ยังไม่กำหนด การปิดบังนี้ไม่รับประกันว่า body หรือ URL ไม่มี secrets
- ผู้ใช้ยืนยัน builtin `otel` ชุดแรกใช้ HTTP handler ใน proxy mode โดยผู้ใช้ต้องระบุ upstream เอง ไม่มีปลายทางสำเร็จรูปและไม่อ้างว่าเป็น OTel collector; direct capture ที่ตอบ 204 ใช้ HTTP handler โดยตรงได้
