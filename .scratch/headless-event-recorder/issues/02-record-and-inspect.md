# 02: Record → close → เปิดตรวจใน Viewer

**What to build:** ผู้ใช้ผูก listener ของตน บันทึก event ด้วย SDK แล้วเปิดไฟล์ด้วย Viewer CLI เพื่อดู timeline และเลือกตรวจ Raw JSON ได้ครบเส้นทาง

**Blocked by:** 01: Initialize monorepo และ toolchain

**Status:** resolved

## Context

ใช้ spec และ tech-stack ที่ยืนยันแล้วของ feature Headless Event Recorder & Viewer รวมศัพท์ใน GLOSSARY เป็นข้อตกลงร่วม; ไม่เปิด scope Replay Engine, protocol adapter หรือ E2E automation เพิ่ม ทุก app/package ที่สร้างต้อง init ผ่าน CLI เท่านั้น หาก CLI ทำไม่ได้ให้แจ้งผู้ใช้ก่อน ไม่สร้าง scaffold เอง

## Acceptance criteria

- [ ] createRecorder รับ file; record รับ source string บังคับ, direction string ไม่บังคับ/ไม่จำกัดค่า และ payload JSON; ผู้เรียกกรองข้อมูลลับเอง ไม่ตีความ protocol หรือ normalize IDs
- [ ] JSONL v1 ไม่มี header หนึ่ง event ต่อบรรทัด มี version=1, seq เริ่ม 1, timestamp UTC, elapsedMs จาก event แรกด้วย monotonic clock และข้อมูล input; ละ direction เมื่อไม่ได้ส่ง
- [ ] record คืนค่าโดยไม่ต้อง await และ snapshot ทันที; แก้ object ภายหลังแล้วไฟล์ไม่เปลี่ยน; close รอเขียนครบและปิดไฟล์
- [ ] ใช้ private shared contract สำหรับ types และ envelope validation โดยไม่ผูก Node filesystem, React หรือ protocol
- [ ] Viewer CLI รับไฟล์ที่ระบุ เปิด browser และ serve static assets ด้วย Node HTTP บน loopback ไม่เปิด arbitrary filesystem path และไม่อัปโหลดข้อมูลออกภายนอก
- [ ] โหลดและ parse recording ใน Web Worker จนเสร็จก่อนใช้งาน; แสดง timeline/รายการ event และ Raw JSON ทั้ง envelope/payload พร้อมเลือกไฟล์อื่นจากเครื่อง
- [ ] UI ค้นหา shadcn ก่อน ประกอบจาก components ที่มี ก่อน custom ด้วย semantic tokens/style ที่สอดคล้องกัน
- [ ] ทดสอบ behavior ของ snapshot/เวลา/ลำดับกับ filesystem จริงใน temporary directory และ smoke record → close → เปิด Viewer/เลือก event ผ่าน CLI และ browser จริง
- [ ] อัปเดตคู่มือ listener integration แบบไม่ผูก protocol และระบุว่า playback controls จะส่งมอบใน ticket ที่เกี่ยวข้อง ไม่แสดง controls ปลอม
## Comments

Implemented on `feat/headless-event-recorder`. SDK JSONL recording, shared contract, loopback CLI and Worker Viewer inspection shipped. Filesystem tests and record→close→CLI/browser smoke passed.
