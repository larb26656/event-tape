# 03: Queue limit, errors และ Recorder lifecycle

**What to build:** ผู้เรียก Recorder รับรู้ทุกการปฏิเสธหรือความล้มเหลว และปิด recording ได้อย่างชัดเจนโดยไม่เขียนทับหรือทิ้งข้อมูลเงียบ ๆ

**Blocked by:** 02: Record → close → เปิดตรวจใน Viewer

**Status:** resolved

## Context

ใช้ spec และ tech-stack ที่ยืนยันแล้วของ feature Headless Event Recorder & Viewer รวมศัพท์ใน GLOSSARY เป็นข้อตกลงร่วม; ไม่เปิด scope Replay Engine, protocol adapter หรือ E2E automation เพิ่ม ทุก app/package ที่สร้างต้อง init ผ่าน CLI เท่านั้น หาก CLI ทำไม่ได้ให้แจ้งผู้ใช้ก่อน ไม่สร้าง scaffold เอง

## Acceptance criteria

- [ ] สร้าง parent directories ที่ขาด แต่ปฏิเสธไฟล์ที่มีอยู่แล้วโดยไม่ overwrite/append; เปิดไฟล์ไม่ได้ให้ createRecorder throw ทันที
- [ ] payload ที่รับเป็น JSON ไม่ได้ throw ตอน record ไม่แอบตัดข้อมูล
- [ ] maxBufferedBytes ค่าเริ่มต้น 16 MiB ปรับได้; คิวเต็มหรือ event เดียวใหญ่เกินเพดานให้ throw ไม่รับ event นั้น แต่ accepted events ก่อนหน้ายังเขียนต่อ
- [ ] write error แบบ async แจ้ง onError ถ้ามี แล้วหยุดรับ event; record ถัดไป throw และ close reject ด้วย error นั้นแม้ callback แจ้งแล้ว ไม่ retry/silent drop
- [ ] record หลังเริ่ม close throw; close ซ้ำรอผลการปิดครั้งเดิม; ไม่ติดตั้ง process exit/signal handlers
- [ ] Vitest ครอบคลุม boundary, lifecycle และ error behavior แบบ deterministic ไม่ใช้ filesystem mocks เป็นหลัก; ตรวจไฟล์ที่เขียนสำเร็จจริง
- [ ] smoke เรียก SDK จริงทั้งสำเร็จและ failure ที่ควบคุมได้ ตรวจการปฏิเสธไฟล์เดิมและผล close
- [ ] คู่มือระบุภาระ await close, error ที่อาจทราบตอน close, crash-tail loss และไม่รับประกันไฟดับ
## Comments

Implemented on `feat/headless-event-recorder`. Queue limits, lifecycle and async error handling covered by 9 SDK tests; real-filesystem error smoke passed.
