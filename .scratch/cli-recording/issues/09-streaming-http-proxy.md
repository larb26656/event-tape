# 09: ส่งต่อ HTTP แบบ Streaming Proxy พร้อมบันทึกสองทิศทาง

**Status:** resolved

**Spec:** [Separate CLI and Player packages and record HTTP traffic](../spec.md)

**What to build:** ชี้แอปมาที่ Event Tape แล้วส่งต่อ traffic ไป upstream HTTP/HTTPS พร้อมบันทึก request/response ที่สัมพันธ์กัน โดยไม่เปลี่ยนเนื้อหา traffic และไม่ buffer body ทั้งก้อน

**Blocked by:** 08 — บันทึก HTTP แบบรับตรงเป็น Recording

## Acceptance criteria

- [ ] เพิ่ม explicit proxy mode ใน HTTP Handler/schema เดิม ต้องระบุ upstream ตรวจค่าก่อน side effects ไม่เปิด client-controlled open proxy และ capture mode เดิมยังใช้ได้
- [ ] รักษา method/path/query และ response status/headers/body ตาม HTTP semantics จัดการ Host/TLS และ transport headers ถูกต้อง รวม repeated Set-Cookie ไม่ collapse ผิด
- [ ] ส่งต่อสองทิศแบบ streaming และ backpressure; พิสูจน์ chunk แรกถึงอีกฝั่งก่อน body จบ; body ที่ส่งต่อครบแม้ capture limit ถูกใช้หมดหรือ headers ใน Recording ถูก redacted
- [ ] request/response เป็น events แยกผูกด้วย session-unique requestId; เก็บ start times ใน payload และ emit แต่ละขาเมื่อจบ/ตัด พร้อม encoding, retained bytes, truncated/incomplete; รักษา acceptance order ไม่บังคับ start order
- [ ] ใช้ limit/redaction และ bounded session lifecycle จาก direct capture กับทั้งสองทิศ ไม่มี secondary unbounded queues; ทดลอง slow peer และ concurrent traffic เพื่อกำหนด finite limits ที่มีหลักฐาน ไม่อ้างเป็น benchmark
- [ ] ส่ง 3xx กลับไม่ follow และไม่ retry; ต่อ upstream ไม่ได้ตอบ 502 และ timeout ตอบ 504 เมื่อยังไม่เริ่ม response พร้อม error ผูก requestId และ session รับงานถัดไปได้
- [ ] ถ้า response เริ่มแล้ว error ให้จบ connection และบันทึก incomplete ไม่เปลี่ยน status ที่ส่งแล้ว; client disconnect ยกเลิก upstream work ที่ไม่จำเป็น ไม่สร้าง success response ปลอม
- [ ] Idle timeout 30 วินาทีปรับได้ไม่ตัด active long stream; shutdown ใช้งบรวมเดิมรวม in-flight proxy และ Writer close บันทึกสิ่งที่ finalize ได้และรายงานงานไม่สมบูรณ์เมื่อ deadline หมด
- [ ] ตรวจ real HTTP และ HTTPS fixture upstream จาก installed CLI พร้อม method/query, repeated headers, payload ใหญ่, binary/multibyte, concurrent correlation, redirect/no-retry, abort/timeout และ graceful stop; เปิด resulting Recording ใน Player จริง
- [ ] อัปเดต docs/help proxy modes, upstream, streaming/error/truncation/privacy และข้อจำกัด ไม่เพิ่ม receiving HTTPS, MITM, WS หรือ replay

## Answer

Implemented on `integration-cli-recording` in `ebdcaa5`, with idle-progress follow-up in `bacc8b1`. Proxy tests exercised a packed installation; a proxy Recording opened in the installed Player. Eight concurrent 512 KiB slow-peer transfers were exercised, not benchmarked.
