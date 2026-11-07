# 07: ติดตั้ง package และใช้งานนอก monorepo

**What to build:** สร้างโปรเจกต์ทดลองนอก monorepo ติดตั้ง package ที่ pack แล้ว ผูก listener เพื่อ record event และใช้ Viewer CLI ตรวจ recording จริง ไม่พึ่ง workspace links

**Blocked by:** 03: Queue limit, errors และ Recorder lifecycle; 04: เปิดไฟล์ไม่สมบูรณ์และแสดงข้อผิดพลาด; 06: ใช้งาน Recording ขนาดเป้าหมาย

**Status:** resolved

## Context

ใช้ spec และ tech-stack ที่ยืนยันแล้วของ feature Headless Event Recorder & Viewer รวมศัพท์ใน GLOSSARY เป็นข้อตกลงร่วม; ไม่เปิด scope Replay Engine, protocol adapter หรือ E2E automation เพิ่ม ทุก app/package ที่สร้างต้อง init ผ่าน CLI เท่านั้น หาก CLI ทำไม่ได้ให้แจ้งผู้ใช้ก่อน ไม่สร้าง scaffold เอง

## Acceptance criteria

- [ ] init โปรเจกต์ทดลองผ่าน CLI เท่านั้น; ติดตั้ง SDK/Viewer จาก packed artifacts ไม่ใช้ workspace links หรือ private registry dependencies
- [ ] Node.js consumer ใช้ ESM SDK และ TypeScript declarations ได้จริง; declarations/runtime imports ไม่อ้าง private recording-format package และ SDK ไม่มี runtime dependencies
- [ ] ผูก listener ในโปรเจกต์ทดลอง ส่ง event หลาย source/direction โดยไม่ต้องใช้ ACP จริง แล้ว await close และตรวจไฟล์จริง
- [ ] เปิด recording ด้วย CLI ที่ติดตั้งจาก artifact นั้นได้ ทั้ง static assets และ Worker ครบ โดยไม่อาศัย Vite dev server หรือ source checkout
- [ ] ตรวจ timeline, Raw JSON, playback/speed/seek และการเลือกไฟล์ใหม่ผ่าน browser จริง; ไม่มี upload ออกภายนอก
- [ ] ยืนยัน schema/error/empty/zero-duration behavior และขนาดเป้าหมายตาม acceptance รวมของ spec โดยอ้างผลที่รันจริง
- [ ] เผยแพร่เฉพาะ SDK และ Viewer ที่ตั้งใจแจก ไม่เผยแพร่ private shared contract; ไม่ต้อง publish npm จริงเพื่อ smoke นี้
- [ ] คู่มือมี install, listener integration, close/error handling, CLI usage และข้อจำกัด; โปรเจกต์ทดลองเป็น smoke artifact ไม่ใช่ app หลักเพิ่ม ไม่เก็บ throwaway scaffolds ลงผลิตภัณฑ์
## Comments

Implemented on `feat/headless-event-recorder`. Packed SDK/Viewer installed in an external CLI-initialized Vite project; ESM+types, recording, installed CLI/assets/Worker, browser controls, error/empty/zero-duration and target-size behavior were verified.
