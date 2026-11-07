# 06: ใช้งาน Recording ขนาดเป้าหมาย

**What to build:** ผู้ใช้เปิดและตรวจ recording ภายในเป้าหมาย 50 MB และ 100,000 events ได้ทั้งรายการ timeline และ playback โดยไม่สร้าง DOM ทั้งรายการ

**Blocked by:** 05: Playback และ seek แบบ timeline

**Status:** resolved

## Context

ใช้ spec และ tech-stack ที่ยืนยันแล้วของ feature Headless Event Recorder & Viewer รวมศัพท์ใน GLOSSARY เป็นข้อตกลงร่วม; ไม่เปิด scope Replay Engine, protocol adapter หรือ E2E automation เพิ่ม ทุก app/package ที่สร้างต้อง init ผ่าน CLI เท่านั้น หาก CLI ทำไม่ได้ให้แจ้งผู้ใช้ก่อน ไม่สร้าง scaffold เอง

## Acceptance criteria

- [ ] อ่าน/parse ครบผ่าน Web Worker ก่อน playback และใช้ TanStack Virtual สำหรับรายการ event; timeline วาดภาพรวมแยก ไม่สร้าง marker/row DOM หนึ่งชิ้นต่อ event โดยไม่จำเป็น
- [ ] เปิด recording ที่อยู่ภายในทั้งเพดาน 50 MB และ 100,000 events แล้วเลื่อนรายการ เลือก event เล่น และ seek ได้บน browser จริง
- [ ] หลังเลื่อนรายการไกลหรือ seek ยังแสดง payload/seq ของ event ที่ถูกต้อง รวม event เวลาเท่ากัน ไม่ใช้แค่เกณฑ์โหลดสำเร็จ
- [ ] ตรวจความถูกต้องเมื่อเปลี่ยนไฟล์และใช้งาน selection/playhead กับรายการ virtualized; ไม่มีการซ่อน future events เพื่อเลี่ยงขนาดข้อมูล
- [ ] ไม่ปฏิเสธไฟล์ใหญ่กว่าเพียงเพราะเกินขนาดเป้าหมาย และไม่อ้าง performance guarantee นอกขอบเขตที่พิสูจน์
- [ ] บันทึกขนาด fixture, จำนวน event, สภาพแวดล้อมและผล smoke ที่สังเกตจริง; ไม่เพิ่มเกณฑ์ latency ที่ยังไม่ได้ตกลง
- [ ] อัปเดตคู่มือขนาดเป้าหมายและข้อจำกัด; รักษา style ของ shadcn ใน virtualized surface
## Comments

Implemented on `feat/headless-event-recorder`. Chrome 150 on macOS loaded a 100,000-event, 16,866,680-byte fixture; 13 virtual rows rendered, and final/tied event selection and file reset were verified.
