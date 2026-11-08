# สัญญาระหว่าง Handler กับ Recorder

Labels: wayfinder:grilling
Type: grilling
Blocked by: 02

Prerequisite: [ช่องทางรับข้อมูลและ protocol ชุดแรก](02-initial-handlers.md)

## Question

Handler แปลงข้อมูลที่รับเป็นเหตุการณ์ให้ Recorder เดิมอย่างไร โดยกำหนดหน่วยเหตุการณ์ payload, source, direction และข้อมูลประกอบ รวมถึงขอบเขตการเพิ่ม handler ภายหลังว่าต้องการแค่ขยายในโค้ดหรือเป็น public extension API? ไม่สร้าง recording core อีกชุด

## Comments

- ผู้ใช้ขยายความว่า handler อาจเป็น file watcher ที่อ่านไฟล์ log แล้วแปลงเป็น event; handler จึงไม่จำกัดเฉพาะ network transport และไม่จำเป็นต้องเปิด server ตัวอย่างนี้ยังไม่ใช่ข้อผูกมัดว่าต้องส่งมอบ file watcher ในชุดแรก ต้องแยกการตัดสินใจแหล่งข้อมูลชุดแรกออกจากสัญญาร่วมของ handler
- ผู้ใช้ยืนยันว่า Handler เป็นส่วนที่ผู้พัฒนาเขียนและแต่ละ Handler บันทึกข้อมูลต่างกันได้ ส่วน [Record Preset](06-record-presets.md) เป็นชุดค่ากำหนดแบบ declarative ไม่ใช่ที่เขียนตรรกะรับข้อมูลหรือแปลง event
- ผู้ใช้ยืนยันให้ handler แต่ละตัวเป็นเจ้าของ schema ของ options โดยเลือก schema ตาม `handler` selector; รายละเอียด config/validation ติดตามที่ [รูปแบบ declarative Record Preset และลำดับการตั้งค่า](06-record-presets.md#comments)
- ผู้ใช้ยืนยัน HTTP proxy บันทึก request/response แยกเป็นคนละ event โดยมี requestId เชื่อมกัน เพื่อเห็นเวลาของแต่ละขาและ request ที่ไม่มี response
- ผู้ใช้ยืนยันข้อมูล HTTP ที่บันทึก: request มี method, URL, headers และ body; response มี status, headers และ body โดยมีค่าเริ่มต้นปิดบัง Authorization, Cookie และ Set-Cookie พร้อม option เปิด/ปิดและเพิ่มรายชื่อ header ที่ปิดบัง
- ผู้ใช้ยืนยันรับ body ได้ทั้ง JSON, text และ binary โดยไม่บังคับ schema ของ body; แทนข้อมูลเป็น text เมื่อไม่สูญเสียข้อมูล หรือ base64 สำหรับ binary พร้อมระบุ encoding
- ผู้ใช้ยืนยันเก็บเฉพาะ 64 KiB แรกต่อ body เป็นค่าเริ่มต้นทั้ง request/response และปรับผ่าน options ได้ วัดเป็น bytes ก่อนแปลง base64 พร้อม `truncated: true` เมื่อถูกตัดและจำนวน bytes ที่เก็บ ไม่ถือว่า JSON/รูปที่ถูกตัดยัง parse/เปิดได้ครบ
- จำกัดข้อมูลที่เก็บระหว่างอ่าน ไม่ buffer body ทั้งก้อนแล้วค่อยตัด; truncation มีผลเฉพาะ Recording ไม่ตัด body ที่ proxy ส่งต่อ
- ผู้ใช้ยืนยันเพิ่ม Handler ในโค้ด CLI พร้อมลงทะเบียนชื่อและ schema; YAML เลือกได้เฉพาะ Handler ที่ลงทะเบียน ไม่โหลด JavaScript/npm plugin ภายนอกในช่วงแรก
- ผู้ใช้ยืนยัน interface ร่วมสำหรับ Handler มีชื่อสำหรับลงทะเบียน/เลือก, options schema, start ที่รับ options ตรวจแล้วกับ Recorder จาก CLI, stop สำหรับ graceful shutdown และช่องทางแจ้ง fatal error หลัง start; method signatures ที่แน่นอนเป็นรายละเอียด implementation
- ผู้ใช้ยืนยัน CLI เป็นเจ้าของ Recorder และปิดหลัง handler หยุดกับงานค้างจบแล้ว; handler ไม่ปิด Recorder เอง รายละเอียด HTTP หรือ file watching ไม่อยู่ใน interface กลาง เพิ่ม Handler ด้วยการ implement สัญญาแล้วลงทะเบียนโดยไม่แก้แกนบันทึก
- ผู้ใช้ยืนยันบันทึก request/response แต่ละ event เมื่อ body ของขานั้นจบหรือ connection ถูกตัด พร้อมเวลาเริ่มรับและสถานะ truncated/incomplete ที่เกี่ยวข้อง ไม่แก้ event ย้อนหลัง ยอมรับว่า stream ที่ยังไม่จบยังไม่มี event ของขานั้นในไฟล์ และ process crash ก่อนจบอาจทำให้เสีย event นั้นแม้ส่งต่อข้อมูลบางส่วนแล้ว
