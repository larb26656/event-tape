# 04: เปิดไฟล์ไม่สมบูรณ์และแสดงข้อผิดพลาด

**What to build:** ผู้ใช้เปิดหลักฐานจาก recording ที่ process หยุดกลางการเขียนได้ พร้อมทราบว่าข้อมูลส่วนไหนไม่สมบูรณ์ แทนการแสดงเหมือน recording ครบ

**Blocked by:** 02: Record → close → เปิดตรวจใน Viewer

**Status:** resolved

## Context

ใช้ spec และ tech-stack ที่ยืนยันแล้วของ feature Headless Event Recorder & Viewer รวมศัพท์ใน GLOSSARY เป็นข้อตกลงร่วม; ไม่เปิด scope Replay Engine, protocol adapter หรือ E2E automation เพิ่ม ทุก app/package ที่สร้างต้อง init ผ่าน CLI เท่านั้น หาก CLI ทำไม่ได้ให้แจ้งผู้ใช้ก่อน ไม่สร้าง scaffold เอง

## Acceptance criteria

- [ ] รองรับเฉพาะ recording schema ของเครื่องมือ ไม่ใช่ arbitrary JSONL; parser ใช้ shared envelope contract ใน Web Worker
- [ ] บรรทัดสุดท้ายถูกตัดกลาง JSON และไม่มี newline ให้เปิด complete prefix พร้อมคำเตือน; ถ้าไม่มี complete event ให้แสดง empty state พร้อมคำเตือน
- [ ] บรรทัดสุดท้ายเป็น JSON สมบูรณ์แต่ไม่มี newline ให้รับตามปกติ
- [ ] ข้อมูลเสียกลางไฟล์, envelope ผิด หรือ version ไม่รองรับให้ปฏิเสธพร้อมบรรทัดและสาเหตุ ไม่ข้าม silently
- [ ] ไฟล์ไม่มี event แสดง empty state และปิด playback controls ที่มี; เปลี่ยนไฟล์แล้วไม่แสดงข้อมูลเก่าเป็น recording ใหม่
- [ ] ทดสอบ parser boundaries/errors แบบ deterministic และ smoke เปิดแต่ละกรณีผ่าน browser จริง ตรวจ warning/error ที่ผู้ใช้เห็น
- [ ] ใช้ shadcn-first สำหรับ warning/error/empty UI และอัปเดตคู่มือไฟล์ที่กู้ได้กับข้อจำกัด
## Comments

Implemented on `feat/headless-event-recorder`. Parser tests passed (8); browser smoke covered valid unterminated tail, recoverable truncation, malformed middle line, unsupported version, and file replacement.
