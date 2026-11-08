# ขอบเขตการส่งต่อและบันทึกของ Proxy

Labels: wayfinder:grilling
Type: grilling
Blocked by: 02

Prerequisite: [ช่องทางรับข้อมูลและ protocol ชุดแรก](02-initial-handlers.md)

## Question

สำหรับ protocol ชุดแรก proxy ต้องรักษาพฤติกรรมต้นทาง–ปลายทางอะไรบ้าง และจะบันทึก request/response หรือข้อความสองทิศทางพร้อมความสัมพันธ์อย่างไร? ตัดสินขอบเขต streaming, connection lifecycle และกรณีส่งต่อสำเร็จแต่บันทึกล้มเหลว โดยไม่เพิ่มการแก้เนื้อหาหรือจำลอง response

## Comments

- ผู้ใช้ยืนยัน direct capture ไม่มี upstream: อ่าน request body จบและส่ง event เข้า Recorder สำเร็จแล้วตอบ 204 No Content ไม่จำลอง response เฉพาะ OTel และไม่อ้างว่าข้อมูลลงดิสก์แล้วหาก Recorder ยัง buffer
- ผู้ใช้ยืนยันเมื่อบันทึกไม่ได้ เช่นดิสก์เต็ม ให้แจ้ง error ชัดเจนและหยุด session แบบควบคุม: หยุดรับงานใหม่ พยายามจบงานที่ค้าง ไม่ส่งต่อไปเรื่อย ๆ โดยทำให้เข้าใจว่ายังบันทึกได้; ข้อกำหนด graceful shutdown อยู่ใน [วงจรการบันทึกและความปลอดภัยบนเครื่องผู้ใช้](05-recording-lifecycle.md#comments)
- ผู้ใช้ยืนยัน upstream ต่อไม่ได้/timeout: บันทึก error ผูกกับ requestId ตอบ 502/504 ตามกรณี โดย session ยังรับ request ถัดไปได้ ถ้าเริ่มส่ง response ไปแล้วให้จบ connection และบันทึกว่า response ไม่สมบูรณ์ ไม่พยายามเปลี่ยน status ที่ส่งไปแล้ว
- ผู้ใช้ยืนยันส่ง response 3xx กลับ client โดยไม่ตาม redirect เอง และไม่ retry request อัตโนมัติ
- ผู้ใช้ยืนยันส่ง request/response ต่อแบบ streaming ไม่รอ body ทั้งก้อน เก็บสำเนาสำหรับ Recording ไม่เกิน body limit และเคารพ backpressure เพื่อไม่สะสมข้อมูลใน memory แบบไม่จำกัด
- ผู้ใช้ยืนยัน idle timeout เริ่มต้น 30 วินาที ปรับได้ วัดช่วงที่ไม่มีข้อมูลไหล ไม่ใช่จำกัดอายุ request ทั้งหมด เพื่อรองรับ stream ที่ยังส่งข้อมูลต่อเนื่อง
