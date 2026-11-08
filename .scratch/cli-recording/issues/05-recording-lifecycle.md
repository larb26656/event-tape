# วงจรการบันทึกและความปลอดภัยบนเครื่องผู้ใช้

Labels: wayfinder:grilling
Type: grilling
Blocked by: 03, 04

Prerequisites: [สัญญาระหว่าง Handler กับ Recorder](03-handler-contract.md) และ [ขอบเขตการส่งต่อและบันทึกของ Proxy](04-proxy-contract.md)

## Question

ผู้ใช้เริ่ม ตั้งค่า และหยุด record อย่างไร เลือกปลายทาง Recording และจัดการไฟล์เดิมอย่างไร และเมื่อหยุดหรือเขียนไม่ทัน/ล้มเหลวต้องเกิดอะไรขึ้น? กำหนดขอบเขต bind address และข้อมูลอ่อนไหวสำหรับ direct/proxy ใน local/dev โดยไม่เปลี่ยนเป็นบริการหลายผู้ใช้

## Comments

- ผู้ใช้ยืนยัน graceful shutdown ทั้ง Ctrl+C และ Recorder ล้มเหลว: หยุดรับ request ใหม่ รองานที่ค้างและปิด Recorder ภายในเวลารอรวมเริ่มต้น 10 วินาที ปรับได้ หากเกินให้ยุติพร้อมแจ้งว่างานบางส่วนอาจไม่สมบูรณ์
- ผู้ใช้ยืนยัน bind 127.0.0.1 เป็นค่าเริ่มต้น; รับจากเครื่องอื่นได้เมื่อผู้ใช้ระบุ listen address เอง ไม่เปิดทุก network interface โดยปริยาย
- ผู้ใช้ยืนยันจำกัดข้อมูลรอเขียน ไม่สะสม memory แบบไม่จำกัดและไม่ทิ้ง event เงียบ ๆ; หากรับต่ออย่างปลอดภัยไม่ได้ให้ error และ graceful shutdown ตามกติกาเดิม เพดานจริงกำหนดจาก Recorder เดิมและ smoke run ตอน implementation ไม่ตั้งเป้า throughput โดยไม่มีหลักฐาน
- ข้อกำหนด output path, การสร้าง directory และไม่เขียนทับไฟล์เดิมอยู่ใน [รูปแบบ declarative Record Preset และลำดับการตั้งค่า](06-record-presets.md#comments) เพื่อไม่คัดลอกคำตอบซ้ำ
