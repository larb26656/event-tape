# 02: รองรับ custom Writer พร้อม lifecycle ของ Recorder ครบ

**What to build:** ผู้ใช้สร้าง Recorder ด้วย custom Writer เพื่อรับ event พร้อม metadata ไปจัดเก็บหรือแสดงผลโดยไม่เขียนไฟล์ได้ Recorder รับผิดชอบความถูกต้องของ event คิว และ shutdown เหมือนกันทุกปลายทาง และ unit test ของ Recorder ไม่ต้องพึ่ง filesystem

**Blocked by:** 01 — แยก File Writer โดยการบันทึกไฟล์เดิมยังทำงานครบ.

**Status:** resolved

- [ ] createRecorder รับ file configuration หรือ writer อย่างใดอย่างหนึ่งเท่านั้น บังคับใน public types และปฏิเสธ configuration ที่กำกวมตอน runtime ก่อนเปิดทรัพยากร; ต้องระบุปลายทาง ไม่สร้าง default filename
- [ ] file configuration ยังเลือก File Writer อัตโนมัติ ส่วน custom Writer ถูกเลือกตอนสร้างและไม่เปลี่ยนกลาง Recording
- [ ] Writer รับ structured event พร้อม v1 metadata ไม่ใช่ JSONL string; custom Writer เลือกรูปแบบและปลายทางเองได้ โดยไม่มี schema หรือ Viewer changes
- [ ] record ยังคง synchronous snapshot และ lossless JSON validation; การแก้ payload ภายหลังไม่เปลี่ยน event ที่รับแล้ว และ event ที่ถูกปฏิเสธไม่กิน sequence หรือกำหนด time origin
- [ ] Recorder ส่ง write ตาม acceptance order ทีละรายการ รอทั้ง sync/async Writer ได้ โดย Writer ไม่ต้องสร้าง ordering queue ซ้ำ
- [ ] maxBufferedBytes มีค่าเริ่มต้น 16 MiB นับ UTF-8 bytes ของ canonical v1 JSONL รวม newline สำหรับ event ที่ค้าง แม้ custom Writer ใช้รูปแบบอื่น ไม่รวม buffer ภายใน Writer
- [ ] คิวเต็มทำให้ record ปฏิเสธเฉพาะ event ใหม่แบบ synchronous; event ที่รับแล้วไม่หาย ปล่อย byte accounting เมื่อ write จบหรือข้าม event หลัง failure และกลับมารับ event ได้เมื่อมีพื้นที่
- [ ] close หยุดรับ event ทันที รอคิวแล้วปิด Writer; เรียกซ้ำได้ Promise เดิม และ Writer หนึ่ง instance มี Recorder เจ้าของเดียว โดยไม่เพิ่ม global ownership registry
- [ ] write ที่ throw หรือ reject ทำให้เก็บ failure แรก แจ้ง optional onError หยุดส่ง queued events ถัดไป ปฏิเสธ record ภายหลัง และทำให้ close reject โดยไม่ retry; error จาก onError ไม่แทน failure แรก
- [ ] หลัง write failure ยังปิด Writer; หาก close ล้มเหลวด้วยให้ write failure แรกเป็น authoritative แต่ถ้าไม่มี write failure ให้รายงาน shutdown failure
- [ ] Recorder tests ใช้ array-backed หรือ controlled Writer ที่ประกาศใน test เอง ครอบคลุม snapshot, metadata, rejected-event sequence continuity, UTF-8 queue boundaries, queue recovery, serialized async writes และ close transitions โดยไม่เขียนไฟล์
- [ ] มี behavioral regression cases สำหรับ synchronous/asynchronous Writer failures, queued-event suppression, onError ที่ throw และ error precedence ระหว่าง write กับ close
- [ ] คง File Writer tests แยกต่างหากและ real-file integration smoke สำหรับ default Recorder; ย้าย tests ให้ตรง seam แทนเก็บ Recorder unit tests ที่พึ่ง filesystem ซ้ำ
- [ ] Public interface และเอกสารอธิบาย custom Writer, constructor-time selection, ownership, buffering definition, failure และ durability guarantees ครบ โดยไม่เพิ่ม Memory Writer หรือปลายทาง built-in อื่น
- [ ] SDK tests, typecheck, lint และ build ผ่าน; ใช้ packed SDK ใน external Node.js ESM consumer พิสูจน์ทั้ง default file configuration และ custom Writer ผ่าน public exports พร้อมตรวจ Recording ที่ได้จริง

## Comments

- อ้างอิง parent spec ของ SDK Recorder / Writer Separation ใน feature directory เดียวกัน รวม Out of Scope
- Test seams ทั้ง Recorder ผ่าน injected Writer และ File Writer ผ่าน filesystem จริงได้รับการตกลงแล้ว ไม่ต้องเปิด test seam ภายในเพิ่ม

Implemented on `integration/sdk-writer-separation` (`f4b0e47`). SDK tests (14), typecheck, lint, build, and a packed external Node.js ESM consumer passed.
