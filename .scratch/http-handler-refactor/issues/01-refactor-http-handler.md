# 01: ปรับโครงสร้าง HTTP Handler และตรวจ options ด้วย Zod

**What to build:** ผู้ดูแลอ่านและแก้ HTTP Handler ได้ง่ายขึ้นจากการจัด options, capture, headers, proxy และ lifecycle ตามหน้าที่ พร้อม tests แยกตาม path ใกล้ Handler โดยผู้ใช้ CLI ยังคงได้รับพฤติกรรมการบันทึกและ forwarding เดิมทั้งหมด ใช้ [spec](../spec.md) เป็นข้อกำหนดร่วม

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] จัด HTTP Handler เป็น modules ตามหน้าที่ โดยเก็บ state ที่สัมพันธ์กันไว้ด้วยกันเมื่อการแยกทำให้ lifecycle เข้าใจยากขึ้น
- [x] ใช้ Zod เป็น direct runtime dependency สำหรับตรวจ HTTP options; คง Handler interface และ `resolve()` เป็นจุดรวมค่าและตรวจ options โดยไม่เพิ่ม method validate แยก
- [x] รักษา precedence explicit CLI > preset > defaults รวม explicit false, การปฏิเสธ unknown fields และ numeric forms ที่ไม่ถูกต้อง พร้อม error ระบุ field และเหตุผลก่อนสร้างไฟล์หรือเปิด listener
- [x] รักษาเงื่อนไข upstream สำหรับ capture/proxy และ CLI options, Recording format, SDK semantics, redaction, body limits, encoding, streaming, backpressure, timeout, failures และ shutdown เดิม
- [x] ย้ายและจัด tests ของ direct capture, proxy และ options/presets ตาม path ใกล้ HTTP Handler; tests สำหรับ session-wide failures ที่ไม่เฉพาะ HTTP อยู่ใกล้ session orchestration ต่อไป ไม่คัดลอก coverage เดิม
- [x] ใช้ CLI จริงเป็นจุดทดสอบหลัก ตรวจ HTTP responses, Recording และ session termination โดยไม่ผูก test กับ private helpers, wiring หรือ source layout; เติม coverage ที่ขาดสำหรับ precedence, invalid configuration และ boundaries
- [x] รัน relevant tests, typecheck และ lint พร้อม smoke ส่ง HTTP จริงผ่าน CLI หลัง refactor และรายงานผลที่สังเกตได้
- [x] ไม่เพิ่ม framework, Handler ชนิดใหม่, public plugin, CLI capability หรือเปลี่ยน schema ของ Recording

## Comments

- Implemented on `integration-http-handler-refactor` in commits `5da27fd` and `9420d3f`.
